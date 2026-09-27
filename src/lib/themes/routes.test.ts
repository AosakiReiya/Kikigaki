import { describe, expect, it } from 'vitest';
import { allThemeRoutePaths, resolveThemeRoute, themeNav, themeRoutes } from './routes';
import { parseThemeContent } from '$lib/server/settings';

describe('theme context routes (78f B1)', () => {
	it('abstract/minimal declare no routes — behavior identical to pre-78f', () => {
		expect(themeRoutes('abstract')).toBeUndefined();
		expect(resolveThemeRoute('abstract', 'services')).toBeNull();
	});
	it('db-* themes never take routes (compiled sandbox v1)', () => {
		expect(resolveThemeRoute('db-neon', 'services')).toBeNull();
	});
	it('unknown id yields no routes and no crash', () => {
		expect(resolveThemeRoute('nope', 'x')).toBeNull();
		expect(allThemeRoutePaths().length).toBeGreaterThanOrEqual(0);
	});
});

describe('themeNav', () => {
	it('null unless a non-empty array of {href,label}', () => {
		expect(themeNav(undefined)).toBeNull();
		expect(themeNav({})).toBeNull();
		expect(themeNav({ nav: [] })).toBeNull();
		expect(themeNav({ nav: [{ href: '/blog' }] })).toBeNull(); // missing label = discard → empty → null
		expect(themeNav({ nav: [{ href: '/services', label: '服務' }] })).toEqual([
			{ href: '/services', label: '服務' }
		]);
	});
	it('caps at 8 items and clamps strings', () => {
		const nav = Array.from({ length: 12 }, (_, i) => ({ href: `/p${i}`, label: 'x'.repeat(100) }));
		const r = themeNav({ nav });
		expect(r?.length).toBe(8);
		expect(r?.[0].label.length).toBeLessThanOrEqual(40);
	});
});

describe('parseThemeContent', () => {
	it('object passes; array/garbage/oversize-source all become {}', () => {
		expect(parseThemeContent('{"a":1}')).toEqual({ a: 1 });
		expect(parseThemeContent('[]')).toEqual({});
		expect(parseThemeContent('{oops')).toEqual({});
		expect(parseThemeContent(undefined)).toEqual({});
	});
});

describe('route slug registry drift guard (server-side reserved list)', () => {
	it('every pack-declared route path is listed in THEME_ROUTE_SLUGS', async () => {
		const { THEME_ROUTE_SLUGS } = await import('$lib/server/pages');
		const { packs } = await import('./registry');
		expect(THEME_ROUTE_SLUGS.length).toBeGreaterThan(0);
		for (const [id, pack] of Object.entries(packs)) {
			for (const r of pack?.routes ?? [])
				expect(THEME_ROUTE_SLUGS, `${id}:${r.path}`).toContain(r.path);
		}
	});
});
