import { json } from '@sveltejs/kit';
import {
	BASE_LOCALE,
	getBlogPostCount,
	getBlogPostSummaries,
	PAGE_SIZE
} from '$lib/server/content';
import { searchBlogPostSummaries } from '$lib/server/search';
import { parseBlogParams, type BlogFilterState } from '$lib/blog-params';
import type { Locale } from '$lib/paraglide/runtime';
import type { RequestHandler } from './$types';

/* * /blog load-more data endpoint: same parseBlogParams dimensions, returns the next page of PostSummary (public data, published only) */
export const GET: RequestHandler = async ({ url, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'db' }, { status: 500 });
	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const { page, q, ...filter } = parseBlogParams(url.searchParams);
	const blogFilter = filter as BlogFilterState;
	const target = Math.max(1, page);
	const opts = { limit: PAGE_SIZE, offset: (target - 1) * PAGE_SIZE };

	if (q) {
		const { posts, total } = await searchBlogPostSummaries(db, locale, q, blogFilter, opts);
		return json({ posts, hasMore: target * PAGE_SIZE < total });
	}
	const [posts, total] = await Promise.all([
		getBlogPostSummaries(db, locale, blogFilter, opts),
		getBlogPostCount(db, blogFilter)
	]);
	return json({ posts, hasMore: target * PAGE_SIZE < total });
};
