/**
 * 79-i18n: pure-function semantics of per-locale site identity (empty = fall back to site-level monolingual).
 * The DB read/write side (getSettings key mapping) is covered by e2e; this locks the fallback rules.
 */
import { describe, expect, it } from 'vitest';
import { identityFor, type SiteSettings } from './settings';
import { siteRuntimeOf } from '$lib/site';

const base = {
	siteDescription: '中文站描述',
	footerText: '中文頁尾',
	copyright: '中文版權',
	aboutBody: '中文關於',
	works: [{ title: 'A', href: '/a' }],
	descriptions: { en: 'EN site description', 'zh-cn': '' },
	footers: { en: 'EN footer' },
	copyrights: {},
	aboutBodies: { en: 'EN about' },
	worksByLocale: { en: [{ title: 'B', href: '/b' }] }
} as Partial<SiteSettings> as SiteSettings;

describe('identityFor fallback (79-i18n)', () => {
	it('locale value wins when non-empty', () => {
		const en = identityFor(base, 'en');
		expect(en.siteDescription).toBe('EN site description');
		expect(en.footerText).toBe('EN footer');
		expect(en.aboutBody).toBe('EN about');
		expect(en.works).toEqual([{ title: 'B', href: '/b' }]);
	});
	it('empty / missing locale value falls back to site-level', () => {
		for (const loc of ['zh-cn', 'jp', 'ko']) {
			const v = identityFor(base, loc);
			expect(v.siteDescription, loc).toBe('中文站描述');
			expect(v.footerText, loc).toBe('中文頁尾');
			expect(v.copyright, loc).toBe('中文版權');
			expect(v.aboutBody, loc).toBe('中文關於');
			expect(v.works, loc).toEqual([{ title: 'A', href: '/a' }]);
		}
	});
});

describe('siteRuntimeOf locale picking', () => {
	it('no locale = site-level verbatim（endpoints 舊行為不變）', () => {
		const r = siteRuntimeOf(base);
		expect(r.description).toBe('中文站描述');
		expect(r.footerText).toBe('中文頁尾');
	});
	it('locale picks per-language override', () => {
		const r = siteRuntimeOf(base, 'en');
		expect(r.description).toBe('EN site description');
		expect(r.copyright).toBe('中文版權'); // not overridden → fallback
	});
});
