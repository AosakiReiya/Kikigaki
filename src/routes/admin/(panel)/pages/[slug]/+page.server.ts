import { error, fail, redirect } from '@sveltejs/kit';
import { getPageAdmin, upsertPage, deletePage } from '$lib/server/pages';
import { customComponentNames } from '$lib/server/components';
import { BASE_LOCALE } from '$lib/server/content';
import { applyFilter } from '$lib/plugins';
import { locales, type Locale } from '$lib/paraglide/runtime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');

	const data = await getPageAdmin(db, params.slug);
	if (!data) error(404, '找不到此頁面');

	return {
		slug: params.slug,
		page: data.page,
		translations: data.translations,
		coveredLocales: Object.keys(data.translations),
		activeLocale: BASE_LOCALE as Locale,
		allLocales: [...locales] as Locale[],
		customNames: [...(await customComponentNames(db))],
		// ComponentPicker :::post candidates (79a-slim: fetched by the admin edit page itself, no longer site-wide resident)
		searchIndex: await applyFilter('search:index', [], { db, locale: BASE_LOCALE })
	};
};

function parseForm(form: FormData) {
	const translations: Record<string, { title: string; summary: string; body: string }> = {};
	for (const loc of locales) {
		const title = String(form.get(`title.${loc}`) ?? '');
		const summary = String(form.get(`summary.${loc}`) ?? '');
		const body = String(form.get(`body.${loc}`) ?? '');
		if (title.trim() || body.trim()) translations[loc] = { title, summary, body };
	}
	return {
		published: form.get('published') !== null,
		showInNav: form.get('showInNav') !== null,
		navOrder: Math.max(0, Number(form.get('navOrder') ?? '0') || 0),
		translations
	};
}

export const actions: Actions = {
	save: async ({ platform, params, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await upsertPage(db, { slug: params.slug, ...parseForm(form) });
		if (!r.ok) return fail(400, { message: r.error });
		return { ok: true, message: '已儲存（即時生效）' };
	},

	delete: async ({ platform, params }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		await deletePage(db, params.slug);
		redirect(303, '/admin/pages');
	}
};
