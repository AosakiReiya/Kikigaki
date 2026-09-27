import { and, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { postTags, tags, tagTranslations } from '$lib/server/db/schema';
import { locales } from '$lib/paraglide/runtime';
import type { Actions, PageServerLoad } from './$types';

/* * editable translation locales (zh-tw is the base name, not via the translations table) */
const TRANSLATABLE = locales.filter((l) => l !== 'zh-tw');

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, tags: [], translatable: TRANSLATABLE };

	const kit = getDb(db);
	// counts include drafts (admin perspective) — distinct from the public getTags (published only)
	const [rows, trs] = await Promise.all([
		kit
			.select({ id: tags.id, name: tags.name, slug: tags.slug, count: sql<number>`count(*)` })
			.from(tags)
			.leftJoin(postTags, eq(postTags.tagId, tags.id))
			.groupBy(tags.id)
			.orderBy(sql`count(*) desc`),
		kit
			.select({
				tagId: tagTranslations.tagId,
				locale: tagTranslations.locale,
				name: tagTranslations.name
			})
			.from(tagTranslations)
	]);
	const byTag = new Map<string, Record<string, string>>();
	for (const t of trs) {
		let rec = byTag.get(t.tagId);
		if (!rec) {
			rec = {};
			byTag.set(t.tagId, rec);
		}
		rec[t.locale] = t.name;
	}

	return {
		dbReady: true as const,
		translatable: TRANSLATABLE,
		tags: rows.map((r) => ({
			id: r.id,
			name: r.name,
			slug: r.slug,
			count: Number(r.count),
			names: byTag.get(r.id) ?? {}
		}))
	};
};

/* * tag slug convention (matches save time): name lowercased */
function toSlug(name: string): string {
	return name.trim().toLowerCase();
}

export const actions: Actions = {
	/* * rename (slug updated in sync) */
	rename: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return { error: '資料庫未配置' };

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!id || !name) return { error: '名稱不能為空' };
		if (name.length > 40) return { error: '名稱過長（上限 40 字元）' };

		const kit = getDb(db);
		const slug = toSlug(name);

		// name-collision check (both name and slug are unique)
		const [dup] = await kit
			.select({ id: tags.id })
			.from(tags)
			.where(sql`${tags.name} = ${name} OR ${tags.slug} = ${slug}`)
			.limit(1);
		if (dup) {
			return dup.id === id ? { error: '名稱沒有變更' } : { error: `標籤「${name}」已存在` };
		}

		await kit.update(tags).set({ name, slug }).where(eq(tags.id, id));
		return { ok: true, message: '✓ 已改名' };
	},

	/* * delete a tag (post_tags removed along; posts kept; translations cascade) */
	remove: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return { error: '資料庫未配置' };

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return { error: '缺少標籤 ID' };

		const kit = getDb(db);
		await kit.delete(tags).where(eq(tags.id, id));
		return { ok: true, message: '✓ 已刪除' };
	},

	/* * save per-locale display names (empty or equal to the base name = fall back to base) */
	saveTranslations: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '缺少標籤 ID' });

		const kit = getDb(db);
		const [tag] = await kit.select({ name: tags.name }).from(tags).where(eq(tags.id, id)).limit(1);
		if (!tag) return fail(404, { message: '找不到標籤' });

		for (const locale of TRANSLATABLE) {
			const name = String(form.get(`name:${locale}`) ?? '')
				.trim()
				.slice(0, 40);
			const sameAsBase = !name || name === tag.name;
			if (sameAsBase) {
				await kit
					.delete(tagTranslations)
					.where(and(eq(tagTranslations.tagId, id), eq(tagTranslations.locale, locale)));
			} else {
				await kit
					.insert(tagTranslations)
					.values({ tagId: id, locale, name })
					.onConflictDoUpdate({
						target: [tagTranslations.tagId, tagTranslations.locale],
						set: { name }
					});
			}
		}
		return { ok: true, message: '✓ 已儲存翻譯' };
	}
};
