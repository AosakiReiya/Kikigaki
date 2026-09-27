import { describe, expect, it } from 'vitest';
import { packThemeZip, unpackThemeZip, THEME_FORMAT, type ThemeArchive } from './archive';
import { unzipSync, zipSync } from 'fflate';

const full: ThemeArchive = {
	slug: 'sunset',
	label: 'Sunset',
	description: 'warm dusk palette',
	base: 'magazine',
	tokensCss: ':root{--x:1}',
	surfaces: {
		Home: { code: '<h1>sunset</h1>', css: 'h1{color:red}' },
		Footer: { code: '<footer/>' }
	}
};

describe('主題流通格式 roundtrip（78d）', () => {
	it('pack→unpack 恆等', () => {
		const r = unpackThemeZip(packThemeZip(full));
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.archive).toEqual(full);
		}
	});
	it('zip 結構：manifest＋tokens＋surfaces 檔名', () => {
		const z = unzipSync(packThemeZip(full));
		expect(Object.keys(z).sort()).toEqual([
			'manifest.json',
			'surfaces/Footer.svelte',
			'surfaces/Home.css',
			'surfaces/Home.svelte',
			'tokens.css'
		]);
		expect(JSON.parse(new TextDecoder().decode(z['manifest.json']))).toMatchObject({
			format: THEME_FORMAT,
			slug: 'sunset',
			base: 'magazine'
		});
	});
	it('behaviors roundtrip + bad behaviors rejected', () => {
		const withB: ThemeArchive = {
			...full,
			behaviors: { transition: 'fade', preloader: false, staggerScale: 0.7 }
		};
		const r = unpackThemeZip(packThemeZip(withB));
		expect(r.ok && r.archive.behaviors).toEqual(withB.behaviors);
		const enc = new TextEncoder();
		const bad = zipSync({
			'manifest.json': enc.encode(
				JSON.stringify({
					format: THEME_FORMAT,
					slug: 'ab1',
					label: 'X',
					behaviors: { transition: 'zoom' }
				})
			)
		});
		expect(unpackThemeZip(bad).ok).toBe(false);
	});
	it('空 surfaces／無 tokens 也可往返', () => {
		const min: ThemeArchive = {
			slug: 'ab1',
			label: 'M',
			description: '',
			base: 'abstract',
			tokensCss: '',
			surfaces: {}
		};
		const r = unpackThemeZip(packThemeZip(min));
		expect(r.ok && r.archive).toEqual(min);
	});
});

describe('解閘（惡意檔零入庫）', () => {
	const mf = JSON.stringify({ format: THEME_FORMAT, slug: 'ab1', label: 'X', base: 'abstract' });
	it('路徑穿越拒', () => {
		const bad = zipSync({
			'manifest.json': new TextEncoder().encode(mf),
			'../evil.txt': new TextEncoder().encode('x')
		});
		const r = unpackThemeZip(bad);
		expect(!r.ok && r.errors.join()).toContain('非法路徑');
	});
	it('非白名單 surface 拒', () => {
		const bad = zipSync({
			'manifest.json': new TextEncoder().encode(mf),
			'surfaces/Weird.svelte': new TextEncoder().encode('x')
		});
		expect(!r0(bad) && errs(bad)).toContain('非法路徑');
	});
	it('非 zip／缺 manifest／錯格式／非法 slug／非法 base 全拒', () => {
		expect(unpackThemeZip(new Uint8Array([1, 2, 3])).ok).toBe(false);
		expect(unpackThemeZip(zipSync({ 'tokens.css': new TextEncoder().encode('a') })).ok).toBe(false);
		const wrong = zipSync({
			'manifest.json': new TextEncoder().encode(
				JSON.stringify({ format: 'other/1', slug: 'ab1', label: 'X' })
			)
		});
		expect(!unpackThemeZip(wrong).ok).toBe(true);
		const badSlug = zipSync({
			'manifest.json': new TextEncoder().encode(
				JSON.stringify({ format: THEME_FORMAT, slug: '../x', label: 'X' })
			)
		});
		expect(unpackThemeZip(badSlug).ok).toBe(false);
		const badBase = zipSync({
			'manifest.json': new TextEncoder().encode(
				JSON.stringify({ format: THEME_FORMAT, slug: 'ab1', label: 'X', base: 'db-evil' })
			)
		});
		expect(unpackThemeZip(badBase).ok).toBe(false);
	});
	it('CSS 檔孤兒（無對應 svelte）＝無害丟棄', () => {
		const z = zipSync({
			'manifest.json': new TextEncoder().encode(mf),
			'surfaces/Home.css': new TextEncoder().encode('h1{}')
		});
		const r = unpackThemeZip(z);
		expect(r.ok && Object.keys(r.archive.surfaces).length).toBe(0);
	});
});

// helpers (readability)
function r0(b: Uint8Array) {
	return unpackThemeZip(b).ok;
}
function errs(b: Uint8Array): string {
	const r = unpackThemeZip(b);
	return r.ok ? '' : r.errors.join(';');
}
