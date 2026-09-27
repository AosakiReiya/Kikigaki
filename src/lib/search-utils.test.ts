import { describe, it, expect } from 'vitest';
import { parseQuery, buildMatch, ftsPhrase, escapeLike, highlightHtml } from './search-utils';

describe('parseQuery', () => {
	it('splits mixed CJK/Latin runs and buckets by length', () => {
		const p = parseQuery('GSAP 動畫 頁面轉場');
		expect(p.terms).toEqual(['GSAP', '動畫', '頁面轉場']);
		expect(p.ftsTerms).toEqual(['GSAP', '頁面轉場']);
		expect(p.likeTerms).toEqual(['動畫']);
	});

	it('dedupes case-insensitively and caps at 6 terms', () => {
		const p = parseQuery('gsap GSAP gsap a b c d e f g h');
		expect(p.terms[0]).toBe('gsap');
		expect(p.terms.filter((t) => t.toLowerCase() === 'gsap')).toHaveLength(1);
		expect(p.terms).toHaveLength(6);
	});

	it('treats punctuation as separators (plus/hyphen stay inside terms)', () => {
		const p = parseQuery('SvelteKit：D1、R2 部署');
		expect(p.terms).toEqual(['SvelteKit', 'D1', 'R2', '部署']);
	});

	it('keeps word-internal hyphen/plus as part of term', () => {
		const p = parseQuery('next-js c++');
		expect(p.terms).toEqual(['next-js', 'c++']);
	});

	it('empty query → no terms', () => {
		expect(parseQuery('  ！??  ').terms).toEqual([]);
	});
});

describe('buildMatch / escaping', () => {
	it('AND-joins quoted phrases', () => {
		expect(buildMatch(parseQuery('GSAP 頁面轉場'))).toBe('"GSAP" AND "頁面轉場"');
	});

	it('null when only short terms', () => {
		expect(buildMatch(parseQuery('動畫 部署'))).toBeNull();
	});

	it('doubles internal quotes', () => {
		expect(ftsPhrase('a"b')).toBe('"a""b"');
	});

	it('escapeLike neutralizes wildcards', () => {
		expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
	});
});

describe('highlightHtml', () => {
	it('marks case-insensitively and escapes HTML', () => {
		const out = highlightHtml('Use <GSAP> for gsap motion', ['gsap']);
		expect(out).toBe('Use &lt;<mark>GSAP</mark>&gt; for <mark>gsap</mark> motion');
	});

	it('marks CJK terms', () => {
		expect(highlightHtml('頁面轉場動畫', ['動畫'])).toBe('頁面轉場<mark>動畫</mark>');
	});

	it('longer terms win over shorter overlapping ones', () => {
		const out = highlightHtml('頁面轉場動畫', ['轉場', '轉場動']);
		// the len-3 fixture beats the len-2 one — the longer CJK span wins (fixtures stay Chinese on purpose)
		expect(out).toBe('頁面<mark>轉場動</mark>畫');
	});

	it('regex metacharacters in terms are literal', () => {
		const out = highlightHtml('C++ and C# tips', ['c++']);
		expect(out).toBe('<mark>C++</mark> and C# tips');
	});

	it('no terms → plain escaped text', () => {
		expect(highlightHtml('a & b', [])).toBe('a &amp; b');
	});
});
