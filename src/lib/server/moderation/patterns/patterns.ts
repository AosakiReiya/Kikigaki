/**
 * 65k spam corpus — WordPress Comment Blocklist
 *
 * Source: https://github.com/splorp/wordpress-comment-blocklist (blacklist.txt)
 * License: MIT, Copyright © 2011–2026 Grant Hutchinson
 *       https://github.com/splorp/wordpress-comment-blocklist/blob/master/license.txt
 *
 * Purpose: supplements rules.ts spam-pattern signals. Returns only "hit count + samples";
 *       whether it's spam is always decided by rules.ts / decide.ts — one hit never means spam.
 *
 * Note: the corpus is mostly English and can false-positive on legit English content (casino / crypto / loan),
 *       so its weight is light and capped — never lethal alone. Chinese spam is rules.ts SPAM_PATTERNS' job.
 */
import corpusRaw from './spam-patterns.txt?raw';

const PATTERNS: string[] = (() => {
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const line of corpusRaw.split('\n')) {
		const p = line.trim().toLowerCase();
		if (!p || seen.has(p)) continue;
		seen.add(p);
		lines.push(p);
	}
	return lines;
})();

export interface SpamPatternMatch {
	hits: number;
	samples: string[];
}

/**
 * Scan content for corpus hits and samples (single pass).
 * Perf: 65k includes is plenty at personal-blog scale; could move to chunked regex / Aho-Corasick later.
 */
export function matchSpamPatterns(content: string, maxSamples = 5): SpamPatternMatch {
	if (!content) return { hits: 0, samples: [] };
	const c = content.toLowerCase();
	let hits = 0;
	const samples: string[] = [];
	for (const p of PATTERNS) {
		if (c.includes(p)) {
			hits++;
			if (samples.length < maxSamples) samples.push(p);
		}
	}
	return { hits, samples };
}
