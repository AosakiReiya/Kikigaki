import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { themes, THEME_IDS, isThemeId, themeManifest, type ThemeBehavior } from './index';
import { applyThemeBehavior, themeBehavior } from './behavior';
import { getVariant } from '$lib/animation/routes';

const BEHAVIOR_KEYS: (keyof ThemeBehavior)[] = ['transition', 'preloader', 'staggerScale'];

describe('theme registry', () => {
	it('every declared id has a consistent manifest', () => {
		for (const id of THEME_IDS) {
			const t = themes[id];
			expect(t.id).toBe(id);
			expect(t.label.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(0);
			expect(t.swatches).toHaveLength(4);
			for (const c of t.swatches) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
			for (const k of BEHAVIOR_KEYS) expect(t.behavior[k]).toBeDefined();
			expect(['curtain', 'fade']).toContain(t.behavior.transition);
			expect(t.behavior.staggerScale).toBeGreaterThan(0);
			expect(t.behavior.staggerScale).toBeLessThanOrEqual(1);
		}
	});

	it('abstract ＝ 現行行為基準（布簾＋Preloader＋原節奏）', () => {
		expect(themes.abstract.behavior).toEqual({
			transition: 'curtain',
			preloader: true,
			staggerScale: 1
		});
	});

	it('isThemeId guards unknown values', () => {
		for (const id of THEME_IDS) expect(isThemeId(id)).toBe(true);
		expect(isThemeId('neon')).toBe(false);
		expect(isThemeId('')).toBe(false);
		expect(isThemeId(null)).toBe(false);
		expect(isThemeId(undefined)).toBe(false);
	});

	it('themeManifest falls back to abstract for junk', () => {
		expect(themeManifest('does-not-exist').id).toBe('abstract');
		expect(themeManifest(null).id).toBe('abstract');
		expect(themeManifest('terminal').id).toBe('terminal');
	});
});

describe('theme behavior → animation integration', () => {
	it('getVariant honours theme transition for forward nav', () => {
		applyThemeBehavior('abstract');
		expect(getVariant('/', '/post/hello')).toBe('curtain');
		applyThemeBehavior('terminal');
		expect(getVariant('/', '/post/hello')).toBe('fade');
		// restore defaults so other test files aren't polluted (module singleton)
		applyThemeBehavior('abstract');
	});

	it('admin/tags same-layer nav stays fade regardless of theme', () => {
		applyThemeBehavior('magazine');
		expect(getVariant('/admin/posts', '/admin/settings')).toBe('fade');
		expect(getVariant('/tags/ai', '/tags/web')).toBe('fade');
		expect(getVariant('/', '/about')).toBe('curtain'); // magazine keeps the curtain
		applyThemeBehavior('abstract');
	});

	it('unknown theme id degrades to abstract behavior', () => {
		applyThemeBehavior(null);
		expect(themeBehavior()).toBe(themes.abstract.behavior);
	});
});

describe('theme css contract', () => {
	const css = readFileSync(fileURLToPath(new URL('../styles/themes.css', import.meta.url)), 'utf8');
	const layout = readFileSync(
		fileURLToPath(new URL('../../routes/layout.css', import.meta.url)),
		'utf8'
	);

	it('layout.css wires themes.css', () => {
		expect(layout).toContain("@import '../lib/styles/themes.css'");
	});

	it('every non-abstract theme has light + dark token override blocks', () => {
		for (const id of THEME_IDS) {
			if (id === 'abstract') continue;
			expect(css).toContain(`html[data-ui-theme='${id}']:not([data-theme='dark'])`);
			expect(css).toContain(`html[data-ui-theme='${id}'][data-theme='dark']`);
		}
	});

	it('each override block (light + dark) declares palette tokens', () => {
		for (const id of THEME_IDS) {
			if (id === 'abstract') continue;
			// grab the bodies of the ":not(dark)" light block and the "[dark]" dark block separately
			for (const sel of [
				`html[data-ui-theme='${id}']:not([data-theme='dark'])`,
				`html[data-ui-theme='${id}'][data-theme='dark']`
			]) {
				const at = css.indexOf(sel);
				expect(at, `missing selector ${sel}`).toBeGreaterThan(-1);
				const body = css.slice(at, css.indexOf('}', at));
				expect(body, `empty override ${sel}`).toMatch(/--(color|font|text|grain)-/);
			}
		}
	});
});
