import { asc, and, desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import {
	postTranslations,
	posts,
	series,
	seriesPosts,
	seriesTranslations
} from '$lib/server/db/schema';
import { movePosition, normalizePositions } from '$lib/series-order';
import { locales } from '$lib/paraglide/runtime';
import type { Actions, PageServerLoad } from './$types';

const TRANSLATABLE = locales.filter((l) => l !== 'zh-tw');

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, translatable: TRANSLATABLE, view: null };

	const kit = getDb(db);
	const [meta] = await kit.select().from(series).where(eq(series.slug, params.slug)).limit(1);
	if (!meta) return { dbReady: false as const, translatable: TRANSLATABLE, view: null };

	const [trRows, members] = await Promise.all([
		kit.select().from(seriesTranslations).where(eq(seriesTranslations.seriesId, meta.id)),
		kit
			.select({
				postId: seriesPosts.postId,
				position: seriesPosts.position,
				isPrimary: seriesPosts.isPrimary,
				slug: posts.slug,
				title:
					sql<string>`COALESCE(MAX(CASE WHEN ${postTranslations.locale} = 'zh-tw' THEN ${postTranslations.title} END), ${posts.slug})`.as(
						'title'
					),
				published: posts.published
			})
			.from(seriesPosts)
			.innerJoin(posts, eq(posts.id, seriesPosts.postId))
			.leftJoin(postTranslations, eq(postTranslations.postId, posts.id))
			.where(eq(seriesPosts.seriesId, meta.id))
			.groupBy(
				seriesPosts.postId,
				seriesPosts.position,
				seriesPosts.isPrimary,
				posts.slug,
				posts.published
			)
			.orderBy(asc(seriesPosts.position))
	]);

	const tr: Record<string, { title: string; summary: string }> = {};
	for (const t of trRows) tr[t.locale] = { title: t.title, summary: t.summary };
	const base = tr['zh-tw'] ?? { title: meta.slug, summary: '' };

	/* * add candidates: all site posts not yet selected (incl. drafts; zh-tw titles, falling back to slug) */
	const memberPostIds = new Set(members.map((m) => m.postId));
	const allPosts = await kit
		.select({
			id: posts.id,
			slug: posts.slug,
			title:
				sql<string>`COALESCE(MAX(CASE WHEN ${postTranslations.locale} = 'zh-tw' THEN ${postTranslations.title} END), ${posts.slug})`.as(
					'title'
				),
			published: posts.published,
			publishedAt: posts.publishedAt
		})
		.from(posts)
		.leftJoin(postTranslations, eq(postTranslations.postId, posts.id))
		.groupBy(posts.id, posts.slug, posts.published, posts.publishedAt)
		.orderBy(desc(posts.publishedAt))
		.limit(300);

	return {
		dbReady: true as const,
		translatable: TRANSLATABLE,
		memberCandidates: allPosts
			.filter((r) => !memberPostIds.has(r.id))
			.map((r) => ({ slug: r.slug, title: r.title, hint: r.published ? '已發布' : '草稿' })),
		view: {
			id: meta.id,
			slug: meta.slug,
			cover: meta.cover ?? '',
			published: meta.published,
			title: base.title,
			summary: base.summary,
			translations: tr,
			members: members.map((m) => ({
				postId: m.postId,
				slug: m.slug,
				title: m.title,
				position: m.position,
				isPrimary: m.isPrimary,
				published: m.published
			}))
		}
	};
};

async function findSeries(kit: ReturnType<typeof getDb>, id: string) {
	const [row] = await kit.select().from(series).where(eq(series.id, id)).limit(1);
	return row;
}

export const actions: Actions = {
	/* * base name / intro / cover / publish state */
	update: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const title = String(form.get('title') ?? '')
			.trim()
			.slice(0, 80);
		const summary = String(form.get('summary') ?? '')
			.trim()
			.slice(0, 500);
		const cover = String(form.get('cover') ?? '')
			.trim()
			.slice(0, 300);
		const published = form.get('published') === 'on';
		if (!id || !title) return fail(400, { message: '標題不能為空' });

		const kit = getDb(db);
		if (!(await findSeries(kit, id))) return fail(404, { message: '找不到系列' });
		const now = new Date();
		await kit
			.update(series)
			.set({ cover: cover || null, published, updatedAt: now })
			.where(eq(series.id, id));
		await kit
			.update(seriesTranslations)
			.set({ title, summary, updatedAt: now })
			.where(and(eq(seriesTranslations.seriesId, id), eq(seriesTranslations.locale, 'zh-tw')));
		return { ok: true, message: '✓ 已更新' };
	},

	/* * per-locale title/intro (empty or equal to base = fall back; all empty = delete) */
	saveTranslations: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: '缺少系列 ID' });

		const kit = getDb(db);
		const [base] = await kit
			.select({ title: seriesTranslations.title, summary: seriesTranslations.summary })
			.from(seriesTranslations)
			.where(and(eq(seriesTranslations.seriesId, id), eq(seriesTranslations.locale, 'zh-tw')))
			.limit(1);
		if (!base) return fail(404, { message: '找不到基準翻譯' });

		const now = new Date();
		for (const locale of TRANSLATABLE) {
			const title = String(form.get(`title:${locale}`) ?? '')
				.trim()
				.slice(0, 80);
			const summary = String(form.get(`summary:${locale}`) ?? '')
				.trim()
				.slice(0, 500);
			const sameAsBase = !title || (title === base.title && summary === base.summary);
			if (sameAsBase) {
				await kit
					.delete(seriesTranslations)
					.where(and(eq(seriesTranslations.seriesId, id), eq(seriesTranslations.locale, locale)));
			} else {
				await kit
					.insert(seriesTranslations)
					.values({ seriesId: id, locale, title, summary, createdAt: now, updatedAt: now })
					.onConflictDoUpdate({
						target: [seriesTranslations.seriesId, seriesTranslations.locale],
						set: { title, summary, updatedAt: now }
					});
			}
		}
		return { ok: true, message: '✓ 已儲存翻譯' };
	},

	/* * add a post (slug; appended at the end; the in_blog reserved field isn't managed here) */
	addPost: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const seriesId = String(form.get('seriesId') ?? '');
		const postSlug = String(form.get('postSlug') ?? '')
			.trim()
			.toLowerCase();
		if (!seriesId || !postSlug) return fail(400, { message: '缺少參數' });

		const kit = getDb(db);
		const [post] = await kit
			.select({ id: posts.id })
			.from(posts)
			.where(eq(posts.slug, postSlug))
			.limit(1);
		if (!post) return fail(400, { message: `找不到文章「${postSlug}」` });
		const [exists] = await kit
			.select({ postId: seriesPosts.postId })
			.from(seriesPosts)
			.where(and(eq(seriesPosts.seriesId, seriesId), eq(seriesPosts.postId, post.id)))
			.limit(1);
		if (exists) return fail(400, { message: '該文章已在系列中' });

		const [maxRow] = await kit
			.select({ m: sql<number>`COALESCE(MAX(${seriesPosts.position}), 0)` })
			.from(seriesPosts)
			.where(eq(seriesPosts.seriesId, seriesId));
		await kit
			.insert(seriesPosts)
			.values({ seriesId, postId: post.id, position: Number(maxRow?.m ?? 0) + 1 });
		return { ok: true, message: '✓ 已加入' };
	},

	/* * remove from the series */
	removePost: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const seriesId = String(form.get('seriesId') ?? '');
		const postId = String(form.get('postId') ?? '');
		if (!seriesId || !postId) return fail(400, { message: '缺少參數' });
		const kit = getDb(db);
		await kit
			.delete(seriesPosts)
			.where(and(eq(seriesPosts.seriesId, seriesId), eq(seriesPosts.postId, postId)));
		const rest = await kit
			.select({ postId: seriesPosts.postId, position: seriesPosts.position })
			.from(seriesPosts)
			.where(eq(seriesPosts.seriesId, seriesId));
		for (const r of normalizePositions(rest)) {
			await kit
				.update(seriesPosts)
				.set({ position: r.position })
				.where(and(eq(seriesPosts.seriesId, seriesId), eq(seriesPosts.postId, r.postId)));
		}
		return { ok: true, message: '✓ 已移出' };
	},

	/* * reorder (drag to the target position; the rest shift and renumber) */
	move: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const seriesId = String(form.get('seriesId') ?? '');
		const postId = String(form.get('postId') ?? '');
		const to = Number.parseInt(String(form.get('to') ?? ''), 10);
		if (!seriesId || !postId || !Number.isFinite(to)) return fail(400, { message: '缺少參數' });

		const kit = getDb(db);
		const rows = await kit
			.select({ postId: seriesPosts.postId, position: seriesPosts.position })
			.from(seriesPosts)
			.where(eq(seriesPosts.seriesId, seriesId));
		const changed = movePosition(rows, postId, to);
		for (const c of changed) {
			await kit
				.update(seriesPosts)
				.set({ position: c.position })
				.where(and(eq(seriesPosts.seriesId, seriesId), eq(seriesPosts.postId, c.postId)));
		}
		return { ok: true, message: changed.length ? '✓ 已重排' : '順序未變' };
	}
};
