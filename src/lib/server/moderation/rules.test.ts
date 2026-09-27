import { describe, expect, it } from 'vitest';
import {
	calculateRiskScore,
	countUrls,
	containsSpamPattern,
	contentTooShort,
	isSuspiciousUserAgent,
	RULES,
	BURST_THRESHOLD,
	type RuleContext
} from './rules';

const baseCtx: RuleContext = {
	content: '這篇文章寫得很好，學到很多。',
	ipHash: 'hash',
	userAgent:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	recentFromIp: 0,
	isDuplicate: false
};

describe('countUrls', () => {
	it('counts scheme, www and bare-domain URLs without double counting', () => {
		expect(countUrls('https://a.com 和 http://b.com 還有 www.c.org 最後是 d.net')).toBe(4);
	});

	it('returns 0 for plain text without URLs', () => {
		expect(countUrls('沒有任何連結的文章')).toBe(0);
	});
});

describe('spam / UA / length signals', () => {
	it('detects blacklist patterns', () => {
		expect(containsSpamPattern('詳情請加微信')).toBe(true);
		expect(containsSpamPattern('正常留言')).toBe(false);
	});

	it('flags very short content as a weak signal', () => {
		expect(contentTooShort('讚')).toBe(true);
		expect(contentTooShort('好文推推')).toBe(false);
	});

	it('flags automated / non-browser user agents', () => {
		expect(isSuspiciousUserAgent('python-requests/2.31')).toBe(true);
		expect(isSuspiciousUserAgent('curl/8.0')).toBe(true);
		expect(isSuspiciousUserAgent('weird-cli')).toBe(true);
		expect(isSuspiciousUserAgent('')).toBe(false);
		expect(
			isSuspiciousUserAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			)
		).toBe(false);
	});
});

describe('calculateRiskScore — URL ladder B（非累加）', () => {
	it('scores a normal comment near zero', () => {
		const r = calculateRiskScore(baseCtx);
		expect(r.total).toBeLessThan(10);
		expect(r.riskReasons).toEqual([]);
	});

	it('gives +30 for 3 URLs (not 40)', () => {
		const r = calculateRiskScore({
			...baseCtx,
			content: '這篇文章很好，我有三個連結：https://a.com https://b.com https://c.com'
		});
		expect(r.urls).toBe(3);
		expect(r.total).toBe(RULES.URL_3);
		expect(r.riskReasons).toContain('url_count');
	});

	it('gives +60 for 6 URLs, NOT cumulative 90', () => {
		const urls = Array.from({ length: 6 }, (_, i) => `https://site${i}.com`).join(' ');
		const r = calculateRiskScore({ ...baseCtx, content: `很多連結：${urls}` });
		expect(r.urls).toBe(6);
		expect(r.total).toBe(RULES.URL_6);
	});

	it('treats 3–5 URLs and 6+ URLs as distinct bands', () => {
		const five = Array.from({ length: 5 }, (_, i) => `https://site${i}.com`).join(' ');
		expect(calculateRiskScore({ ...baseCtx, content: five }).total).toBe(RULES.URL_3);
	});
});

describe('calculateRiskScore — other signals', () => {
	it('adds DUPLICATE for repeated comments', () => {
		const r = calculateRiskScore({ ...baseCtx, isDuplicate: true });
		expect(r.total).toBe(RULES.DUPLICATE);
		expect(r.riskReasons).toContain('duplicate');
	});

	it('adds BURST when recentFromIp reaches threshold', () => {
		const r = calculateRiskScore({ ...baseCtx, recentFromIp: BURST_THRESHOLD });
		expect(r.total).toBe(RULES.BURST);
		expect(r.riskReasons).toContain('burst');
	});

	it('adds SPAM_PATTERN for zh blacklist words (strong rule)', () => {
		const r = calculateRiskScore({ ...baseCtx, content: '快來代開發票' });
		expect(r.spamPattern).toBe(true);
		expect(r.total).toBe(RULES.SPAM_PATTERN);
		expect(r.riskReasons).toContain('spam_pattern');
	});

	it('adds SUSPICIOUS_UA for automation tools but never enough to spam alone', () => {
		const r = calculateRiskScore({ ...baseCtx, userAgent: 'python-requests/2.31' });
		expect(r.suspiciousUserAgent).toBe(true);
		expect(r.total).toBe(RULES.SUSPICIOUS_UA);
		expect(r.total).toBeLessThan(30);
	});
});

describe('calculateRiskScore — 65k corpus', () => {
	const spamContent =
		'viagra casino click here poker slot lottery bet free money pharmacy cheap online';

	it('counts corpus hits and caps the score contribution at +50', () => {
		const r = calculateRiskScore({ ...baseCtx, content: spamContent });
		expect(r.patternHits).toBeGreaterThan(0);
		expect(r.patternSamples.length).toBeGreaterThan(0);
		// capped: only the first 5 count → +50, and corpus alone is always < 90 (never direct spam)
		expect(r.total).toBe(
			Math.min(r.patternHits, RULES.CORPUS_PATTERN_HIT_CAP) * RULES.CORPUS_PATTERN
		);
		expect(r.total).toBeLessThan(90);
		expect(r.riskReasons).toContain('corpus_pattern');
	});

	it('does not trigger corpus for clean Chinese content', () => {
		const r = calculateRiskScore({ ...baseCtx, content: '這篇文章寫得很好，學到很多。' });
		expect(r.patternHits).toBe(0);
	});
});

describe('calculateRiskScore — accumulation', () => {
	it('accumulates multiple signals and records all reasons', () => {
		const r = calculateRiskScore({
			...baseCtx,
			content: 'https://a.com https://b.com https://c.com 快來免費領取',
			isDuplicate: true,
			userAgent: 'curl/8.0'
		});
		const expected =
			RULES.URL_3 +
			RULES.SPAM_PATTERN +
			RULES.DUPLICATE +
			RULES.SUSPICIOUS_UA +
			Math.min(r.patternHits, RULES.CORPUS_PATTERN_HIT_CAP) * RULES.CORPUS_PATTERN;
		expect(r.total).toBe(expected);
		expect(r.riskReasons).toEqual(
			expect.arrayContaining(['url_count', 'spam_pattern', 'duplicate', 'suspicious_ua'])
		);
	});
});

describe('Phase 74：站長禁詞', () => {
	const base = {
		ipHash: 'x',
		userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36',
		recentFromIp: 0,
		isDuplicate: false
	};
	it('唯一命中詞各計一次分＋reason＋bannedHits', () => {
		const r = calculateRiskScore({
			...base,
			content: '來賭博啊，賭博很好，還可以加微信',
			bannedWords: ['賭博', '加微信'],
			bannedWordScore: 45
		});
		expect(r.bannedHits.sort()).toEqual(['賭博', '加微信'].sort());
		expect(r.riskReasons).toContain('banned_word');
		expect(r.total).toBeGreaterThanOrEqual(90); // 2×45 (plus the built-in spam_pattern 40 stacked)
	});
	it('大小寫不敏感（拉丁詞）', () => {
		const r = calculateRiskScore({ ...base, content: 'Buy VIAGRA now', bannedWords: ['viagra'] });
		expect(r.bannedHits).toEqual(['viagra']);
	});
	it('無禁詞表＝行為不變', () => {
		const r = calculateRiskScore({ ...base, content: '普通留言一枚' });
		expect(r.bannedHits).toEqual([]);
		expect(r.total).toBeLessThan(30);
	});
	it('custom bannedWordScore 生效', () => {
		const r = calculateRiskScore({
			...base,
			content: '含禁詞a',
			bannedWords: ['禁詞a'],
			bannedWordScore: 10
		});
		expect(r.total).toBe(10);
	});
});
