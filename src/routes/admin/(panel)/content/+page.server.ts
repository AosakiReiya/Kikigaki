import { error, fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { contentItems } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { deleteType, listTypes, parseFields, upsertType } from '$lib/server/content-items';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	const [types, counts] = await Promise.all([
		listTypes(db),
		getDb(db)
			.select({ typeKey: contentItems.typeKey, c: sql<number>`COUNT(*)` })
			.from(contentItems)
			.groupBy(contentItems.typeKey)
			.all()
	]);
	const countMap = new Map(counts.map((r) => [r.typeKey, Number(r.c)]));
	return {
		types: types.map((t) => ({ ...t, fieldsCount: parseFields(t.fieldsRaw).fields.length })),
		counts: Object.fromEntries(countMap.entries())
	};
};

export const actions: Actions = {
	save: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return { ok: false, errors: ['資料庫未配置'] };
		const fd = await request.formData();
		const res = await upsertType(db, {
			key: String(fd.get('key') ?? '').trim(),
			label: String(fd.get('label') ?? ''),
			fieldsJson: String(fd.get('fields') ?? '[]'),
			titleField: String(fd.get('titleField') ?? 'title'),
			enabled: fd.get('enabled') !== 'off'
		});
		// business errors must go through fail(): otherwise SvelteKit treats it as success and resets the form (eating user input)
		return res.ok ? { ok: true, key: String(fd.get('key')) } : fail(400, { errors: res.errors });
	},
	delete: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return { ok: false };
		const fd = await request.formData();
		await deleteType(db, String(fd.get('key') ?? ''));
		return { ok: true };
	}
};
