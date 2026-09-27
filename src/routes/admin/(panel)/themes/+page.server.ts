import { fail, redirect } from '@sveltejs/kit';
import { componentStaticIssues } from '$lib/agent/tools';
import type { ActiveThemeId } from '$lib/themes';
import { unpackThemeZip, type ThemeArchive } from '$lib/themes/archive';
import { getSettings, updateSettings } from '$lib/server/settings';
import {
	deleteTheme,
	getTheme,
	listThemes,
	makeThemeId,
	saveTheme,
	validateSurfaces
} from '$lib/server/themes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { themes: [], active: 'abstract', themeContent: '' };
	const [themes, settings] = await Promise.all([listThemes(db), getSettings(db)]);
	const tc = Object.keys(settings.themeContent).length
		? JSON.stringify(settings.themeContent, null, 2)
		: '';
	return { themes, active: settings.uiTheme, themeContent: tc };
};

function formTheme(fd: FormData) {
	const surfacesRaw = String(fd.get('surfaces') ?? '{}');
	return {
		id: String(fd.get('id') ?? ''),
		label: String(fd.get('label') ?? ''),
		description: String(fd.get('description') ?? ''),
		tokensCss: String(fd.get('tokens') ?? ''),
		surfaces: surfacesRaw,
		behaviors: String(fd.get('behaviors') ?? ''),
		base: String(fd.get('base') || 'abstract')
	};
}

export const actions: Actions = {
	create: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const id = makeThemeId(String(fd.get('slug') ?? ''));
		if (!id) return fail(400, { message: 'slug 非法（a-z0-9-，2-32 字，小寫）' });
		if (await getTheme(db, id)) return fail(400, { message: '主題已存在' });
		const base = String(fd.get('base') || 'abstract');
		const r = await saveTheme(db, {
			id,
			label: String(fd.get('label') ?? '').trim() || id.slice(3),
			description: '',
			tokensCss: '',
			surfaces: {},
			base
		});
		if (!r.ok) return fail(400, { message: r.errors.join('；') });
		return { ok: true, id };
	},
	save: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const input = formTheme(fd);
		// surface error names early (full validation lives in saveTheme)
		const sv = validateSurfaces(input.surfaces);
		if (!sv.ok) return fail(400, { message: sv.error ?? 'surfaces 非法' });
		const r = await saveTheme(db, input);
		if (!r.ok) return fail(400, { message: r.errors.join('；') });
		return { ok: true, id: r.record.id, version: r.record.version };
	},
	/* * 78f (B1): theme context content JSON (nav/hero/pages/… theme-defined keys) */
	content: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const raw = String(fd.get('themeContent') ?? '').trim();
		if (raw) {
			if (raw.length > 32_000) return fail(400, { message: 'theme_content 超過 32KB 上限' });
			try {
				const v = JSON.parse(raw);
				if (!v || typeof v !== 'object' || Array.isArray(v))
					return fail(400, { message: 'theme_content 需為 JSON 物件 {…}' });
			} catch {
				return fail(400, { message: 'theme_content 不是合法 JSON' });
			}
		}
		await updateSettings(db, { themeContent: raw });
		return { ok: true, message: raw ? '主題內容已儲存' : '主題內容已清空（回主题出廠佈局）' };
	},
	delete: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		const settings = await getSettings(db);
		if (settings.uiTheme === id)
			return fail(400, { message: '主題使用中，不能刪除（先切換其他主題）' });
		return (await deleteTheme(db, id)) ? { ok: true } : fail(404, { message: '不存在' });
	},
	/* * 78d: zip import (kikigaki-theme/1 → validate + static safety check → save as db-<slug>, collisions auto-suffixed) */
	importZip: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const file = fd.get('file');
		if (!(file instanceof File) || file.size === 0 || file.size > 3_000_000)
			return fail(400, { message: '請選擇 .zip 檔（≤3MB）' });
		const unpacked = unpackThemeZip(new Uint8Array(await file.arrayBuffer()));
		if (!unpacked.ok) return fail(400, { message: unpacked.errors.join('；') });
		const a: ThemeArchive = unpacked.archive;
		const issues: string[] = [];
		for (const [k, v] of Object.entries(a.surfaces))
			if (v?.code?.trim())
				issues.push(
					...componentStaticIssues(`imported-${k.toLowerCase()}`, v.code).map((i) => `${k}: ${i}`)
				);
		if (issues.length) return fail(400, { message: `靜態安全檢未過：${issues.join('；')}` });
		let id = `db-${a.slug}`;
		for (let n = 2; n < 20 && (await getTheme(db, id)); n++) id = `db-${a.slug}-${n}`;
		if (await getTheme(db, id)) return fail(409, { message: '主題 id 空間耗盡，請改 slug 重打包' });
		const r = await saveTheme(db, {
			id,
			label: a.label,
			description: a.description,
			tokensCss: a.tokensCss,
			surfaces: a.surfaces,
			behaviors: a.behaviors ?? '',
			base: a.base
		});
		if (!r.ok) return fail(400, { message: r.errors.join('；') });
		return { ok: true, imported: id, message: `已匯入為 ${id}（未啟用）` };
	},
	apply: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		if (!(await getTheme(db, id))) return fail(404, { message: '不存在' });
		await updateSettings(db, { uiTheme: id as ActiveThemeId });
		redirect(303, '/admin/themes');
	}
};
