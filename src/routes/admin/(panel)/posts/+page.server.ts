import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { publishDuePosts } from '$lib/server/content';
import { categories, postTags, posts, series, seriesPosts, tags } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (db) await publishDuePosts(db).catch(() => {}); // Phase 67
	if (!db)
		return {
			dbReady: false as const,
			posts: [],
			postTagsBySlug: {} as Record<string, string[]>,
			allTags: [],
			postSeriesBySlug: {} as Record<string, string[]>,
			allSeries: [],
			categories: []
		};

	const kit = getDb(db);
	// titles use base-language translations (post_translations is the single content source); locales = existing translation list
	const rows = await kit
		.select({
			id: posts.id,
			slug: posts.slug,
			cover: posts.cover,
			pinned: posts.pinned,
			type: posts.type,
			seriesOnly: posts.seriesOnly,
			published: posts.published,
			publishedAt: posts.publishedAt,
			views: posts.views,
			createdAt: posts.createdAt,
			updatedAt: posts.updatedAt,
			title:
				sql<string>`COALESCE((SELECT title FROM post_translations WHERE post_id = posts.id AND locale = 'zh-tw'), '')`.as(
					'title'
				),
			translatedLocales: sql<
				string | null
			>`(SELECT group_concat(locale) FROM post_translations WHERE post_id = posts.id)`.as(
				'translated_locales'
			)
		})
		.from(posts)
		.orderBy(desc(posts.publishedAt), desc(posts.pinned));

	// each post's books (slug → series slug[]) + all books (58.7 filtering)
	const srows = await kit
		.select({
			postSlug: posts.slug,
			seriesSlug: series.slug,
			title:
				sql<string>`(SELECT title FROM series_translations WHERE series_id = series.id AND locale = 'zh-tw')`.as(
					'title'
				)
		})
		.from(seriesPosts)
		.innerJoin(posts, eq(posts.id, seriesPosts.postId))
		.innerJoin(series, eq(series.id, seriesPosts.seriesId));
	const postSeriesBySlug: Record<string, string[]> = {};
	const seriesOptionsMap = new Map<string, string>();
	for (const r of srows) {
		(postSeriesBySlug[r.postSlug] ??= []).push(r.seriesSlug);
		seriesOptionsMap.set(r.seriesSlug, r.title || r.seriesSlug);
	}

	// each post's tags (slug → tag name[]) + all tags (for filtering)
	const links = await kit
		.select({ postSlug: posts.slug, tagName: tags.name })
		.from(postTags)
		.innerJoin(posts, eq(postTags.postId, posts.id))
		.innerJoin(tags, eq(postTags.tagId, tags.id));
	const postTagsBySlug = new Map<string, string[]>();
	const allTags = new Set<string>();
	for (const l of links) {
		const arr = postTagsBySlug.get(l.postSlug) ?? [];
		arr.push(l.tagName);
		postTagsBySlug.set(l.postSlug, arr);
		allTags.add(l.tagName);
	}

	const catRows = await kit
		.select({ slug: categories.slug, name: categories.name })
		.from(categories)
		.orderBy(categories.sort);

	return {
		dbReady: true as const,
		categories: catRows,
		posts: rows.map((r) => ({
			...r,
			translatedLocales: (r.translatedLocales ?? '').split(',').filter(Boolean)
		})),
		postTagsBySlug: Object.fromEntries(postTagsBySlug),
		postSeriesBySlug,
		allSeries: [...seriesOptionsMap.entries()].map(([slug, name]) => ({ slug, name })),
		allTags: [...allTags].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
	};
};

export const actions: Actions = {
	/* * pinned toggle (home horizontal cards) */
	togglePin: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return { message: '資料庫未配置' };

		const form = await request.formData();
		const id = String(form.get('id') ?? '');

		const kit = getDb(db);
		const [row] = await kit
			.select({ pinned: posts.pinned })
			.from(posts)
			.where(eq(posts.id, id))
			.limit(1);
		if (!row) return { message: '找不到文章' };

		await kit
			.update(posts)
			.set({ pinned: !row.pinned, updatedAt: new Date() })
			.where(eq(posts.id, id));

		return { ok: true };
	}
};
