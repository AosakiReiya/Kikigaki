import { fail, redirect } from '@sveltejs/kit';
import { listPagesAdmin, upsertPage, deletePage } from '$lib/server/pages';
import { validatePageSlug } from '$lib/server/pages';
import { BASE_LOCALE } from '$lib/server/content';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, pages: [] };
	return { dbReady: true as const, pages: await listPagesAdmin(db) };
};

export const actions: Actions = {
	/* * create: only makes the base-locale placeholder, redirects to the edit page for content */
	create: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const slug = String(form.get('slug') ?? '')
			.trim()
			.toLowerCase();
		const title = String(form.get('title') ?? '').trim();
		const err = validatePageSlug(slug);
		if (err) return fail(400, { message: err });
		if (!title) return fail(400, { message: '標題必填' });

		const r = await upsertPage(db, {
			slug,
			published: false,
			showInNav: false,
			navOrder: 0,
			translations: { [BASE_LOCALE]: { title, summary: '', body: '' } }
		});
		if (!r.ok) return fail(400, { message: r.error });
		redirect(303, `/admin/pages/${slug}`);
	},

	delete: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const slug = String(form.get('slug') ?? '');
		await deletePage(db, slug);
		return { ok: true };
	}
};
