import { describe, it, expect, beforeAll } from 'vitest';
import { themePack, packs, ensureThemePack } from './registry';
import { THEME_IDS } from './index';
import type { ThemePack } from './contracts';

// 79a-slim: under lazy packs, land everything first then run sync assertions (same guarantee as the +layout fence)
beforeAll(async () => {
	await Promise.all(THEME_IDS.map((id) => ensureThemePack(id)));
});

const SLOTS = [
	'Header',
	'Footer',
	'Home',
	'Blog',
	'Search',
	'Post',
	'Archive',
	'Page',
	'About'
] as const;

function assertPackShape(pack: ThemePack, label: string) {
	for (const slot of SLOTS) {
		expect(pack[slot], `${label}.${slot}`).toBeTruthy();
		// Svelte components (function/class); must not be undefined (a missing slot = white-screen incident)
		expect(typeof pack[slot], `${label}.${slot} kind`).toBe('function');
	}
}

describe('pack registry', () => {
	it('every theme id resolves to a complete pack (slots non-null)', () => {
		for (const id of THEME_IDS) {
			const pack = themePack(id);
			assertPackShape(pack, id);
		}
	});

	it('terminal/corporate/news/magazine own their structure; minimal reuses abstract', () => {
		expect(themePack('terminal').Home).not.toBe(themePack('abstract').Home);
		expect(themePack('terminal').Blog).not.toBe(themePack('abstract').Blog);
		expect(themePack('terminal').Header).not.toBe(themePack('abstract').Header);
		expect(themePack('minimal').Home).toBe(themePack('abstract').Home);
		expect(themePack('minimal').Blog).toBe(themePack('abstract').Blog);
		expect(themePack('magazine').Home).not.toBe(themePack('abstract').Home);
		// 78e identity kits (T1-T3): corporate/news/magazine have own Header+Blog+Post
		for (const id of ['corporate', 'news', 'magazine']) {
			expect(themePack(id).Header, id).not.toBe(themePack('abstract').Header);
			expect(themePack(id).Blog, id).not.toBe(themePack('abstract').Blog);
			expect(themePack(id).Post, id).not.toBe(themePack('abstract').Post);
		}
		// magazine's non-identity surfaces share abstract implementations (zero-copy)
		expect(themePack('magazine').Page).toBe(themePack('abstract').Page);
		expect(themePack('magazine').Series).toBe(themePack('abstract').Series);
	});

	it('unknown id degrades to abstract pack (never crashes)', () => {
		expect(themePack('nope')).toBe(themePack('abstract'));
		expect(themePack(null)).toBe(themePack('abstract'));
		expect(themePack(undefined)).toBe(themePack('abstract'));
	});

	it('abstract pack keeps the site chrome components (zero-diff baseline)', async () => {
		const [{ default: Header }, { default: Footer }] = await Promise.all([
			import('$lib/components/Header.svelte'),
			import('$lib/components/Footer.svelte')
		]);
		expect(themePack('abstract').Header).toBe(Header);
		expect(themePack('abstract').Footer).toBe(Footer);
	});

	it('packs map only declares valid theme ids', () => {
		for (const id of Object.keys(packs)) {
			expect((THEME_IDS as readonly string[]).includes(id)).toBe(true);
		}
	});
});
