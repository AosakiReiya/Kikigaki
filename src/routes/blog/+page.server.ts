import { redirect } from '@sveltejs/kit';
import {
	BASE_LOCALE,
	getBlogPostCount,
	getBlogPostSummaries,
	getCategories,
	getPostYearStats,
	getSeriesIndex,
	getTags,
	PAGE_SIZE
} from '$lib/server/content';
import { searchBlogPostSummaries } from '$lib/server/search';
import { parseBlogParams, blogQuery, type BlogFilterState } from '$lib/blog-params';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) throw new Error('資料庫未配置');

	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const { page, q, ...filter } = parseBlogParams(url.searchParams);
	// sonly and series are mutually exclusive: entering a series context exits the "series-only" toggle
	if (filter.series) filter.sonly = false;
	const blogFilter = filter as BlogFilterState;
	const pageOpts = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };

	// q present → full-text hits × filters; otherwise the plain paginated list
	const listed = q
		? await searchBlogPostSummaries(db, locale, q, blogFilter, pageOpts)
		: {
				posts: await getBlogPostSummaries(db, locale, blogFilter, pageOpts),
				total: await getBlogPostCount(db, blogFilter)
			};
	const [tags, years, categories, seriesList] = await Promise.all([
		getTags(db, locale),
		getPostYearStats(db),
		getCategories(db, locale),
		getSeriesIndex(db, locale)
	]);
	const { posts, total } = listed;

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	if (page > totalPages)
		throw redirect(307, `/blog${blogQuery({ ...blogFilter, q, page: totalPages })}`);

	const displayTag = tags.find((t) => t.name === filter.tag);
	const title = q
		? `${q} · ${m.blog_title()}`
		: filter.tag
			? `#${displayTag?.display ?? filter.tag}`
			: m.blog_title();

	return {
		posts,
		total,
		page,
		totalPages,
		tags,
		years,
		categories,
		series: seriesList,
		filter: blogFilter,
		query: q ?? '',
		meta: {
			title,
			description: m.blog_meta_desc(),
			path: '/blog'
		}
	};
};
