import { desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { comments, pageViews, posts } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const };

	const kit = getDb(db);
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

	const [postRow] = await kit.select({ count: sql<number>`count(*)` }).from(posts);
	const [pendingRow] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(comments)
		.where(eq(comments.status, 'pending'));
	const [viewsRow] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(pageViews)
		.where(gte(pageViews.viewDate, sevenDaysAgo));
	const topPosts = await kit
		.select({
			slug: posts.slug,
			title:
				sql<string>`COALESCE((SELECT title FROM post_translations WHERE post_id = posts.id AND locale = 'zh-tw'), '')`.as(
					'title'
				),
			views: posts.views
		})
		.from(posts)
		.orderBy(desc(posts.views))
		.limit(5);

	return {
		dbReady: true as const,
		postCount: postRow?.count ?? 0,
		pendingComments: pendingRow?.count ?? 0,
		views7d: viewsRow?.count ?? 0,
		topPosts
	};
};
