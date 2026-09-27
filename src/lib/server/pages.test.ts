import { describe, it, expect } from 'vitest';
import { validatePageSlug, RESERVED_PAGE_SLUGS } from './pages';

describe('page slug validation', () => {
	it('accepts WordPress-style slugs', () => {
		for (const s of ['uses', 'guest-book', 'a', 'p1', 'my-page-2', 'links']) {
			expect(validatePageSlug(s), s).toBeNull();
		}
	});

	it('rejects malformed slugs', () => {
		expect(validatePageSlug('')).toMatch(/slug_invalid/);
		expect(validatePageSlug('-abc')).toMatch(/slug_invalid/);
		expect(validatePageSlug('abc-')).toMatch(/slug_invalid/);
		expect(validatePageSlug('UPPER')).toMatch(/slug_invalid/);
		expect(validatePageSlug('有中文')).toMatch(/slug_invalid/);
		expect(validatePageSlug('a b')).toMatch(/slug_invalid/);
		expect(validatePageSlug('a'.repeat(51))).toMatch(/slug_invalid/);
	});

	it('rejects reserved paths that are otherwise slug-shaped (static routes / locales)', () => {
		const slugShaped = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
		const checked = RESERVED_PAGE_SLUGS.filter((s) => slugShaped.test(s));
		expect(checked.length).toBeGreaterThan(10); // make sure the majority is actually validated
		for (const s of checked) {
			expect(validatePageSlug(s), s).toMatch(/slug_reserved/);
		}
		// dotted system filenames can never be valid slugs (SLUG_RE blocks first)
		expect(validatePageSlug('rss.xml')).toMatch(/slug_invalid/);
	});

	it('reserved list covers all built-in public top-levels', () => {
		for (const s of ['blog', 'tags', 'about', 'admin', 'api', 'en', 'jp', 'zh-cn']) {
			expect(RESERVED_PAGE_SLUGS).toContain(s);
		}
	});
});
