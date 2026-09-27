/**
 * Phase 78d — theme interchange format `kikigaki-theme/1` (zip).
 * Structure: manifest.json + tokens.css + surfaces/<Surface>.svelte[.css].
 * Pure functions usable on both sides (export = Worker; import validation = server action; unit tests = node).
 * Guards: filename allowlist (path traversal extinct), size caps, base limited to built-in themes (honest-import principle).
 */
import { zipSync, unzipSync } from 'fflate';
import { isThemeId, DB_THEME_SLUG_RE, validateBehaviors, type DbThemeBehaviors } from './index';
import { THEME_SURFACES, type ThemeSurface } from './contracts';
import type { DbThemeSurfaces } from '$lib/server/themes';

export const THEME_FORMAT = 'kikigaki-theme/1';

export interface ThemeArchive {
	slug: string;
	label: string;
	description: string;
	base: string;
	tokensCss: string;
	surfaces: DbThemeSurfaces;
	behaviors?: DbThemeBehaviors;
}

const FILE_MAX = 200_000;
const TOTAL_MAX = 1_200_000;
const SURFACE_FILE_RE = new RegExp(`^surfaces/(${THEME_SURFACES.join('|')})\\.(svelte|css)$`);

export function packThemeZip(a: ThemeArchive): Uint8Array {
	const files: Record<string, Uint8Array> = {
		'manifest.json': enc(
			JSON.stringify(
				{
					format: THEME_FORMAT,
					slug: a.slug,
					label: a.label,
					description: a.description,
					base: a.base,
					...(a.behaviors && Object.keys(a.behaviors).length ? { behaviors: a.behaviors } : {})
				},
				null,
				1
			)
		)
	};
	if (a.tokensCss.trim()) files['tokens.css'] = enc(a.tokensCss);
	for (const [s, v] of Object.entries(a.surfaces) as [
		ThemeSurface,
		{ code: string; css?: string }
	][]) {
		if (!v?.code?.trim()) continue;
		files[`surfaces/${s}.svelte`] = enc(v.code);
		if (v.css?.trim()) files[`surfaces/${s}.css`] = enc(v.css);
	}
	return zipSync(files, { level: 6 });
}

export type UnpackResult = { ok: true; archive: ThemeArchive } | { ok: false; errors: string[] };

export function unpackThemeZip(bytes: Uint8Array): UnpackResult {
	const errors: string[] = [];
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch {
		return { ok: false, errors: ['不是合法的 zip 檔'] };
	}
	let total = 0;
	for (const [name, data] of Object.entries(entries)) {
		if (name !== 'manifest.json' && name !== 'tokens.css' && !SURFACE_FILE_RE.test(name)) {
			errors.push(`非法路徑：${name}`);
			continue;
		}
		if (data.length > FILE_MAX) errors.push(`${name} 過大（>${FILE_MAX}）`);
		total += data.length;
	}
	if (total > TOTAL_MAX) errors.push(`解壓總量過大（>${TOTAL_MAX}）`);
	if (errors.length) return { ok: false, errors };

	const mf = entries['manifest.json'];
	if (!mf) return { ok: false, errors: ['缺 manifest.json'] };
	let m: {
		format?: string;
		slug?: string;
		label?: string;
		description?: string;
		base?: string;
		behaviors?: unknown;
	};
	try {
		m = JSON.parse(dec(mf));
	} catch {
		return { ok: false, errors: ['manifest.json 非法 JSON'] };
	}
	if (m.format !== THEME_FORMAT)
		return { ok: false, errors: [`格式不支援：${String(m.format)}（期待 ${THEME_FORMAT}）`] };
	if (typeof m.slug !== 'string' || !DB_THEME_SLUG_RE.test(m.slug))
		return { ok: false, errors: ['slug 非法（a-z0-9-，3-32 字）'] };
	if (typeof m.label !== 'string' || !m.label.trim() || m.label.length > 64)
		return { ok: false, errors: ['label 必填且 ≤64'] };
	if (m.base !== undefined && !isThemeId(m.base))
		return { ok: false, errors: [`base 非法：${String(m.base)}`] };
	const bv = validateBehaviors(m.behaviors ?? '');
	if (!bv.ok) return { ok: false, errors: [bv.error ?? 'behaviors invalid'] };

	const surfaces: DbThemeSurfaces = {};
	for (const [name, data] of Object.entries(entries)) {
		const mm = SURFACE_FILE_RE.exec(name);
		if (!mm) continue;
		const s = mm[1] as ThemeSurface;
		if (mm[2] === 'svelte') surfaces[s] = { code: dec(data) };
		else if (surfaces[s]) surfaces[s] = { code: surfaces[s].code, css: dec(data) };
	}
	return {
		ok: true,
		archive: {
			slug: m.slug,
			label: m.label.trim(),
			description: typeof m.description === 'string' ? m.description.slice(0, 200) : '',
			base: isThemeId(m.base) ? m.base : 'abstract',
			tokensCss: entries['tokens.css'] ? dec(entries['tokens.css']).slice(0, 40_000) : '',
			surfaces,
			...(bv.value && Object.keys(bv.value).length ? { behaviors: bv.value } : {})
		}
	};
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
