/**
 * Rule Engine (first layer, cheapest): pure functions, no AI calls, no $env dependency.
 * Input: one comment + a few DB stats; output: risk score, per-signal breakdown and risk_reasons.
 *
 * Design principles:
 * - a risk score, not "has URL / hits keyword → ban". No single rule blocks directly.
 * - every signal emits a reason key (risk_reasons) so "why it was judged" stays knowable later.
 */
import { matchSpamPatterns } from './patterns/patterns';

export interface RuleContext {
	content: string;
	/** SHA-256 IP hash */
	ipHash: string;
	/** raw User-Agent */
	userAgent: string;
	/** comments already submitted by this IP within the burst window (excluding this one) */
	recentFromIp: number;
	/** whether the content exactly duplicates an existing comment from this IP */
	isDuplicate: boolean;
	/** Phase 74: owner custom banned words (pre-lowercased); a hit → +bannedWordScore per unique word, and pending at minimum */
	bannedWords?: string[];
	/** points per banned-word hit (default 45) */
	bannedWordScore?: number;
}

export interface RiskBreakdown {
	total: number;
	/** triggered reason signals (for persistence) */
	riskReasons: string[];
	urls: number;
	duplicate: boolean;
	recentFromIp: number;
	/** hit the Chinese/custom spam blocklist */
	spamPattern: boolean;
	/** owner banned words hit (Phase 74) */
	bannedHits: string[];
	/** 65k corpus hit count */
	patternHits: number;
	/** sample of corpus hits (first few) */
	patternSamples: string[];
	/** too short (weak signal, not a spam indicator) */
	tooShort: boolean;
	suspiciousUserAgent: boolean;
	contentLength: number;
}

/** per-rule weights (tunable from real observations) */
export const RULES = {
	/** ≥ 3 URLs (stepped, not cumulative) */
	URL_3: 30,
	/** ≥ 6 URLs (stepped, not cumulative, replaces URL_3) */
	URL_6: 60,
	/** duplicate comment */
	DUPLICATE: 40,
	/** many comments in a short window */
	BURST: 30,
	/** hit the Chinese/custom spam blocklist (strong rule) */
	SPAM_PATTERN: 40,
	/** 65k corpus per hit (weak signal, cumulative) */
	CORPUS_PATTERN: 10,
	/** corpus counts at most N hits → capped at 50, never lethal alone (< 90) */
	CORPUS_PATTERN_HIT_CAP: 5,
	/** content too short (weak signal) */
	SHORT: 5,
	/** suspicious User-Agent (+20 once, never lethal alone) */
	SUSPICIOUS_UA: 20
} as const;

/** same IP commenting more than this within the window counts as a burst */
export const BURST_THRESHOLD = 5;

/**
 * Chinese / custom strong blocklist (the corpus is English; Chinese spam rides on this — a hit adds SPAM_PATTERN).
 * Keep extending it.
 */
export const SPAM_PATTERNS = ['賭博', '博彩', '代開發票', '兼職刷單', '加微信', '免費領取'];

const URL_SCHEME = /https?:\/\//gi;
const URL_WWW = /www\./gi;
/** bare domains without scheme/www prefix (avoid double-counting with the above; TLD must be 2~6 letters) */
const URL_BARE = /(?<!https?:\/\/|www\.)\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z]{2,6}\b/gi;

const AUTOMATED_UA =
	/python|curl|wget|node|java|okhttp|axios|scrapy|libwww|httpclient|bot|spider|crawler|php/i;
const BROWSER_UA = /mozilla|chrome|safari|firefox|edge|opera|webkit|gecko/i;

export function countUrls(content: string): number {
	const scheme = content.match(URL_SCHEME)?.length ?? 0;
	const www = content.match(URL_WWW)?.length ?? 0;
	const bare = content.match(URL_BARE)?.length ?? 0;
	return scheme + www + bare;
}

export function containsSpamPattern(content: string): boolean {
	return SPAM_PATTERNS.some((w) => content.includes(w));
}

/** fewer than 4 chars after whitespace stripping counts as too short (+5 only; weak signal, not a spam indicator) */
export function contentTooShort(content: string): boolean {
	return content.replace(/\s+/g, '').length < 4;
}

/** non-browser or obviously automated UAs count as suspicious (+20; not enough for spam alone) */
export function isSuspiciousUserAgent(userAgent: string): boolean {
	if (!userAgent || userAgent.trim().length === 0) return false;
	if (AUTOMATED_UA.test(userAgent)) return true;
	return !BROWSER_UA.test(userAgent);
}

export function calculateRiskScore(ctx: RuleContext): RiskBreakdown {
	const urls = countUrls(ctx.content);
	const spamPattern = containsSpamPattern(ctx.content);
	const tooShort = contentTooShort(ctx.content);
	const suspiciousUserAgent = isSuspiciousUserAgent(ctx.userAgent);
	const corpus = matchSpamPatterns(ctx.content);

	const riskReasons: string[] = [];
	let total = 0;

	// URL ladder (not cumulative): 3–5 → +30, 6+ → +60
	if (urls >= 6) {
		total += RULES.URL_6;
		riskReasons.push('url_count');
	} else if (urls >= 3) {
		total += RULES.URL_3;
		riskReasons.push('url_count');
	}

	if (ctx.isDuplicate) {
		total += RULES.DUPLICATE;
		riskReasons.push('duplicate');
	}

	if (ctx.recentFromIp >= BURST_THRESHOLD) {
		total += RULES.BURST;
		riskReasons.push('burst');
	}

	if (spamPattern) {
		total += RULES.SPAM_PATTERN;
		riskReasons.push('spam_pattern');
	}

	// Phase 74: owner banned words — each UNIQUE hit word scores once; a hit also guarantees pending at minimum (decide side)
	const bannedHits: string[] = [];
	if (ctx.bannedWords?.length) {
		const lower = ctx.content.toLowerCase();
		for (const w of ctx.bannedWords) {
			if (w && lower.includes(w)) bannedHits.push(w);
		}
		if (bannedHits.length) {
			total += bannedHits.length * (ctx.bannedWordScore ?? 45);
			riskReasons.push('banned_word');
		}
	}

	// 65k corpus: +10/hit, capped 50, never lethal alone
	if (corpus.hits > 0) {
		total += Math.min(corpus.hits, RULES.CORPUS_PATTERN_HIT_CAP) * RULES.CORPUS_PATTERN;
		riskReasons.push('corpus_pattern');
	}

	if (tooShort) {
		total += RULES.SHORT;
		riskReasons.push('too_short');
	}

	if (suspiciousUserAgent) {
		total += RULES.SUSPICIOUS_UA;
		riskReasons.push('suspicious_ua');
	}

	return {
		bannedHits,
		total,
		riskReasons,
		urls,
		duplicate: ctx.isDuplicate,
		recentFromIp: ctx.recentFromIp,
		spamPattern,
		patternHits: corpus.hits,
		patternSamples: corpus.samples,
		tooShort,
		suspiciousUserAgent,
		contentLength: ctx.content.length
	};
}
