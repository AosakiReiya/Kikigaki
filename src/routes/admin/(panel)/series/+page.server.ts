import { desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { posts, series, seriesPosts, seriesTranslations } from '$lib/server/db/schema';
import { SERIES_SLUG_RE } from '$lib/series-order';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, series: [] };

	const kit = getDb(db);
	const rows = await kit
		.select({
			id: series.id,
			slug: series.slug,
			cover: series.cover,
			published: series.published,
			title: sql<string>`COALESCE(${seriesTranslations.title}, '')`.as('title'),
			count: sql<number>`count(${posts.id})`
		})
		.from(series)
		.leftJoin(
			seriesTranslations,
			sql`${seriesTranslations.seriesId} = ${series.id} AND ${seriesTranslations.locale} = 'zh-tw'`
		)
		.leftJoin(seriesPosts, eq(seriesPosts.seriesId, series.id))
		.leftJoin(posts, eq(posts.id, seriesPosts.postId))
		.groupBy(series.id)
		.orderBy(desc(series.createdAt));

	return {
		dbReady: true as const,
		series: rows.map((r) => ({
			id: r.id,
			slug: r.slug,
			title: r.title || r.slug,
			cover: r.cover,
			published: r.published,
			count: Number(r.count)
		}))
	};
};

export const actions: Actions = {
	/* * create a series (slug immutable; base zh-tw translation written along) */
	create: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const slug = String(form.get('slug') ?? '')
			.trim()
			.toLowerCase();
		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		if (!SERIES_SLUG_RE.test(slug))
			return fail(400, { message: 'slug 需為小寫英數連字號（1–40 字元）' });
		if (!title || title.length > 80) return fail(400, { message: '標題需為 1–80 字元' });

		const kit = getDb(db);
		const [dup] = await kit
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, slug))
			.limit(1);
		if (dup) return fail(400, { message: `系列「${slug}」已存在` });

		const now = new Date();
		await kit
			.insert(series)
			.values({ id: `series:${slug}`, slug, published: false, createdAt: now, updatedAt: now });
		await kit.insert(seriesTranslations).values({
			seriesId: `series:${slug}`,
			locale: 'zh-tw',
			title,
			summary,
			createdAt: now,
			updatedAt: now
		});
		return { ok: true, message: `✓ 已建立系列「${title}」` };
	},

	/* * delete a series (posts unaffected; links and translations cascade) */
	remove: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '缺少系列 ID' });
		const kit = getDb(db);
		await kit.delete(series).where(eq(series.id, id));
		return { ok: true, message: '✓ 已刪除' };
	}
};
