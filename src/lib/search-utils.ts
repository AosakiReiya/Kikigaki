/**
 * /search pure functions (no server deps: shared by worker query layer, unit tests, future CLI).
 * Index side is FTS5 trigram (≥3-char substring matching); 2-char CJK terms fall back to LIKE.
 */

export interface ParsedQuery {
	/** terms that can use MATCH (≥3 code points) */
	ftsTerms: string[];
	/** short terms needing LIKE fallback (1–2 code points) */
	likeTerms: string[];
	/** all terms (as-is, for highlighting; de-duplicated, lowercasing for matching only) */
	terms: string[];
}

/** tokenization: runs of letters/digits/underscore/plus/hyphen (CJK is \p{L} so it naturally forms runs) */
const TOKEN_RE = /[\p{L}\p{N}_+#-]+/gu;
const MAX_TERMS = 6;

export function parseQuery(raw: string): ParsedQuery {
	const tokens = (raw.match(TOKEN_RE) ?? []).map((t) => t.trim()).filter(Boolean);
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const t of tokens) {
		const key = t.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		terms.push(t);
		if (terms.length >= MAX_TERMS) break;
	}
	return {
		ftsTerms: terms.filter((t) => [...t].length >= 3),
		likeTerms: terms.filter((t) => [...t].length < 3),
		terms
	};
}

/** FTS5 phrase string: internal double quotes doubled */
export function ftsPhrase(term: string): string {
	return `"${term.replaceAll('"', '""')}"`;
}

/** build the MATCH expression from parse results (join='AND'|'OR'; empty → null) */
export function buildMatch(parsed: ParsedQuery, join: 'AND' | 'OR' = 'AND'): string | null {
	if (parsed.ftsTerms.length === 0) return null;
	return parsed.ftsTerms.map((t) => ftsPhrase(t)).join(` ${join} `);
}

/** LIKE wildcard/escape char escaping (pairs with ESCAPE '\') */
export function escapeLike(term: string): string {
	return term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function escapeHtml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/**
 * Highlight: HTML-escape first, then wrap each term (case-insensitive, literal) in <mark>.
 * Longer terms first so short terms don't chew up long-term match spans.
 */
export function highlightHtml(text: string, terms: string[]): string {
	const safe = escapeHtml(text);
	const sorted = [...terms]
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)
		.map((t) => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	if (sorted.length === 0) return safe;
	const re = new RegExp(`(${sorted.join('|')})`, 'gi');
	return safe.replace(re, '<mark>$1</mark>');
}
