import { and, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { categories, categoryTranslations, posts } from '$lib/server/db/schema';
import { locales } from '$lib/paraglide/runtime';
import type { Actions, PageServerLoad } from './$types';

/* * editable translation locales (zh-tw is the base name, not via the translations table) */
const TRANSLATABLE = locales.filter((l) => l !== 'zh-tw');

const PROTECTED_SLUG =
	'article'; /* * built-in categories (posts.type defaults): cannot be deleted */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, categories: [], translatable: TRANSLATABLE };

	const kit = getDb(db);
	// counts include drafts (admin perspective) — distinct from the public getCategories (published only)
	const [rows, trs] = await Promise.all([
		kit
			.select({
				id: categories.id,
				slug: categories.slug,
				name: categories.name,
				sort: categories.sort,
				count: sql<number>`count(${posts.id})`
			})
			.from(categories)
			.leftJoin(posts, eq(posts.type, categories.slug))
			.groupBy(categories.id)
			.orderBy(categories.sort, sql`count(${posts.id}) desc`),
		kit
			.select({
				categoryId: categoryTranslations.categoryId,
				locale: categoryTranslations.locale,
				name: categoryTranslations.name
			})
			.from(categoryTranslations)
	]);
	const byCat = new Map<string, Record<string, string>>();
	for (const t of trs) {
		let rec = byCat.get(t.categoryId);
		if (!rec) {
			rec = {};
			byCat.set(t.categoryId, rec);
		}
		rec[t.locale] = t.name;
	}

	return {
		dbReady: true as const,
		translatable: TRANSLATABLE,
		categories: rows.map((r) => ({
			id: r.id,
			slug: r.slug,
			name: r.name,
			sort: r.sort,
			count: Number(r.count),
			names: byCat.get(r.id) ?? {},
			protected: r.slug === PROTECTED_SLUG
		}))
	};
};

export const actions: Actions = {
	/* * create a category (slug = URL identity, immutable after creation) */
	create: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const slug = String(form.get('slug') ?? '')
			.trim()
			.toLowerCase();
		const name = String(form.get('name') ?? '').trim();
		if (!SLUG_RE.test(slug)) return fail(400, { message: 'slug 需為小寫英數連字號（1–40 字元）' });
		if (!name || name.length > 40) return fail(400, { message: '名稱需為 1–40 字元' });

		const kit = getDb(db);
		const [dup] = await kit
			.select({ id: categories.id })
			.from(categories)
			.where(eq(categories.slug, slug))
			.limit(1);
		if (dup) return fail(400, { message: `分類「${slug}」已存在` });

		const [maxRow] = await kit
			.select({ m: sql<number>`COALESCE(MAX(${categories.sort}), 0)` })
			.from(categories);
		const now = new Date();
		await kit.insert(categories).values({
			id: `category:${slug}`,
			slug,
			name,
			sort: Number(maxRow?.m ?? 0) + 1,
			createdAt: now,
			updatedAt: now
		});
		return { ok: true, message: `✓ 已建立分類「${name}」` };
	},

	/* * update base name and order (slug untouched — avoids breaking links) */
	update: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const sort = Number.parseInt(String(form.get('sort') ?? ''), 10);
		if (!id) return fail(400, { message: '缺少分類 ID' });
		if (!name || name.length > 40) return fail(400, { message: '名稱需為 1–40 字元' });
		if (!Number.isFinite(sort)) return fail(400, { message: '排序需為數字' });

		const kit = getDb(db);
		await kit
			.update(categories)
			.set({ name, sort, updatedAt: new Date() })
			.where(eq(categories.id, id));
		return { ok: true, message: '✓ 已更新' };
	},

	/* * delete a category (blocked while posts reference it; article is the default and undeletable) */
	remove: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '缺少分類 ID' });

		const kit = getDb(db);
		const [cat] = await kit
			.select({ slug: categories.slug })
			.from(categories)
			.where(eq(categories.id, id))
			.limit(1);
		if (!cat) return fail(404, { message: '找不到分類' });
		if (cat.slug === PROTECTED_SLUG)
			return fail(400, { message: `「${PROTECTED_SLUG}」為內建預設分類，不可刪除` });
		const [used] = await kit
			.select({ count: sql<number>`count(*)` })
			.from(posts)
			.where(eq(posts.type, cat.slug));
		if (Number(used?.count ?? 0) > 0)
			return fail(400, { message: `尚有 ${used.count} 篇文章使用此分類，請先改分配` });

		await kit.delete(categories).where(eq(categories.id, id));
		return { ok: true, message: '✓ 已刪除' };
	},

	/* * save per-locale display names (empty or equal to the base name = fall back to base) */
	saveTranslations: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '缺少分類 ID' });

		const kit = getDb(db);
		const [cat] = await kit
			.select({ name: categories.name })
			.from(categories)
			.where(eq(categories.id, id))
			.limit(1);
		if (!cat) return fail(404, { message: '找不到分類' });

		const now = new Date();
		for (const locale of TRANSLATABLE) {
			const name = String(form.get(`name:${locale}`) ?? '')
				.trim()
				.slice(0, 40);
			const sameAsBase = !name || name === cat.name;
			if (sameAsBase) {
				await kit
					.delete(categoryTranslations)
					.where(
						and(eq(categoryTranslations.categoryId, id), eq(categoryTranslations.locale, locale))
					);
			} else {
				await kit
					.insert(categoryTranslations)
					.values({ categoryId: id, locale, name, createdAt: now, updatedAt: now })
					.onConflictDoUpdate({
						target: [categoryTranslations.categoryId, categoryTranslations.locale],
						set: { name, updatedAt: now }
					});
			}
		}
		return { ok: true, message: '✓ 已儲存翻譯' };
	}
};
