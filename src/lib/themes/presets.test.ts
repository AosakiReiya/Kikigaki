/**
 * Seed presets (scripts/seed-data/theme-content.*.json) are product surface:
 * they ship in the public repo and the workbench reads the same keys the packs
 * do. This test pins the contract so presets can never drift into blank-theme
 * territory. (32 KB gate mirrors the server-side write guard.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const load = (name: string) =>
	JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL(`../../../scripts/seed-data/theme-content.${name}.json`, import.meta.url)
			),
			'utf8'
		)
	) as Record<string, unknown>;

const NAV_RE = /^\//;

describe('theme-content seed presets', () => {
	for (const name of ['corporate', 'news', 'magazine']) {
		it(`${name}: valid JSON, under the 32 KB write gate`, () => {
			const tc = load(name);
			expect(JSON.stringify(tc).length).toBeLessThan(32 * 1024);
		});

		it(`${name}: nav is a non-empty local-link list`, () => {
			const nav = load(name).nav;
			expect(Array.isArray(nav)).toBe(true);
			expect((nav as unknown[]).length).toBeGreaterThan(0);
			for (const item of nav as Array<Record<string, string>>) {
				expect(NAV_RE.test(item.href)).toBe(true);
				expect(item.label.length).toBeGreaterThan(0);
			}
		});

		it(`${name}: carries no real contact domains`, () => {
			expect(JSON.stringify(load(name))).not.toMatch(/gmail|qq\.com|kikigaki\.com/);
		});
	}

	it('corporate: every key corporate surfaces read is present', () => {
		const tc = load('corporate');
		for (const key of [
			'hero',
			'stats',
			'services',
			'servicesTitle',
			'newsTitle',
			'aboutHeadline',
			'values',
			'ctaTitle',
			'contact',
			'pages'
		]) {
			expect(tc, key).toHaveProperty(key);
		}
		const pages = tc.pages as Record<string, Record<string, unknown>>;
		expect(pages.services.title).toBeTruthy();
		expect(Array.isArray(pages.services.items)).toBe(true);
	});

	it('news: newsroom About reads mastNote + newsdesk(email, tipline, note)', () => {
		const tc = load('news');
		expect(typeof tc.mastNote).toBe('string');
		const desk = tc.newsdesk as Record<string, string>;
		for (const key of ['email', 'tipline', 'note']) expect(desk, key).toBeTruthy();
	});
});
