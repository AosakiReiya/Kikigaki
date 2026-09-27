/**
 * 79a-slim: on-demand endpoint for overlay search (replaces the root-layout site-wide resident searchIndex).
 * FTS5 (posts_fts, bm25 ranked) + custom pages LIKE (few pages, scanned last).
 * Returns top 8 only; public read-only, no personal data; cache not shared (per-locale/site content is live).
 */
import { json } from '@sveltejs/kit';
import { searchBlogPostSummaries } from '$lib/server/search';
import { getPublishedPageSummaries } from '$lib/server/pages';
import { BASE_LOCALE } from '$lib/server/content';
import type { Locale } from '$lib/paraglide/runtime';
import type { RequestEvent } from './$types';

export const prerender = false;

export async function GET({ platform, url, locals }: RequestEvent) {
	const db = platform?.env.DB;
	if (!db) return json({ results: [] });

	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const q = url.searchParams.get('q')?.trim().slice(0, 60) ?? '';
	if (q.length === 0) return json({ results: [] });

	// posts: FTS ranking (≤2 chars fall back to LIKE, see search.ts notes); pages: small-table linear scan
	const [{ posts }, pages] = await Promise.all([
		searchBlogPostSummaries(
			db,
			locale,
			q,
			{ tag: null, year: null, sort: 'new', type: null, series: null, sonly: false },
			{ limit: 8, offset: 0 }
		),
		getPublishedPageSummaries(db, locale)
	]);

	const ql = q.toLowerCase();
	const pageHits = pages
		.filter(
			(p) =>
				p.title.toLowerCase().includes(ql) ||
				p.summary.toLowerCase().includes(ql) ||
				`/${p.slug}`.toLowerCase().includes(ql)
		)
		.slice(0, 3);

	return json(
		{
			results: [
				...posts.map((p) => ({
					slug: p.slug,
					kind: 'post' as const,
					title: p.title,
					summary: p.summary,
					tags: p.tags.map((t) => ({ name: t.name, display: t.display }))
				})),
				...pageHits.map((p) => ({
					slug: p.slug,
					kind: 'page' as const,
					title: p.title,
					summary: p.summary,
					tags: []
				}))
			].slice(0, 8)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
}
