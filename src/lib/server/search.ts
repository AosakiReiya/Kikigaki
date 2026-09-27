import type { D1Database } from '@cloudflare/workers-types';
import {
	parseQuery,
	buildMatch,
	escapeLike,
	highlightHtml,
	type ParsedQuery
} from '$lib/search-utils';
import { getPostSummariesBySlugs, type PostSummary } from './content';
import type { BlogFilterState } from '$lib/blog-params';
import type { Locale } from '$lib/paraglide/runtime';

/** search hit (post + highlighted HTML) */
export interface SearchResult {
	post: PostSummary;
	titleHtml: string;
	summaryHtml: string;
}

export interface SearchResponse {
	results: SearchResult[];
	total: number;
	terms: string[];
}

export interface SearchPageOptions {
	limit?: number;
	offset?: number;
}

const BM25_WEIGHTS = '10.0, 3.0, 1.0';
const DEFAULT_LIMIT = 12;
/** max rows fetched per query (pre-dedup; ample at blog scale) */
const SCAN_CAP = 300;

const FROM = `
  FROM posts_fts
  JOIN post_translations t ON t.rowid = posts_fts.rowid
  JOIN posts p ON p.id = t.post_id`;

/** MATCH (≥3-char terms ANDed) + two-char short-term LIKE fallback; stackable with /blog filters (tag × year) */
function buildWhere(
	parsed: ParsedQuery,
	filter?: Partial<BlogFilterState>
): { sql: string; binds: (string | number)[] } {
	const parts: string[] = ['p.published = 1'];
	const binds: (string | number)[] = [];
	const match = buildMatch(parsed, 'AND');
	if (match) {
		parts.unshift('posts_fts MATCH ?');
		binds.push(match);
	}
	for (const t of parsed.likeTerms) {
		parts.push(
			`(posts_fts.title LIKE ? ESCAPE '\\' OR posts_fts.summary LIKE ? ESCAPE '\\' OR posts_fts.body LIKE ? ESCAPE '\\')`
		);
		const like = `%${escapeLike(t)}%`;
		binds.push(like, like, like);
	}
	// Phase 58.6 visibility (placed after MATCH/LIKE: parts and binds order must stay aligned)
	if (filter?.series) {
		parts.push(
			'EXISTS (SELECT 1 FROM series_posts sp JOIN series se ON se.id = sp.series_id AND se.published = 1 WHERE sp.post_id = p.id AND se.slug = ?)'
		);
		binds.push(filter.series);
	} else {
		parts.push('p.series_only = ?');
		binds.push(filter?.sonly ? 1 : 0);
	}
	if (filter?.tag) {
		parts.push(
			`t.post_id IN (SELECT pt.post_id FROM post_tags pt JOIN tags tg ON tg.id = pt.tag_id WHERE tg.name = ?)`
		);
		binds.push(filter.tag);
	}
	if (filter?.type) {
		parts.push('p.type = ?');
		binds.push(filter.type);
	}
	if (filter?.year) {
		parts.push(`CAST(strftime('%Y', p.published_at / 1000, 'unixepoch') AS INTEGER) = ?`);
		binds.push(filter.year);
	}
	return { sql: parts.join(' AND '), binds };
}

/**
 * Hit post ids (deduped, ordered). Returns the post_id rows + deduped total.
 * Order: default bm25 relevance (when MATCH-able terms exist); sort='views' → view-count order;
 * no long terms (pure LIKE) always falls back to date order.
 */
async function searchRankedIds(
	db: D1Database,
	rawQuery: string,
	opts: SearchPageOptions,
	filter?: Partial<BlogFilterState>
): Promise<{ slugs: string[]; total: number }> {
	const parsed = parseQuery(rawQuery);
	if (parsed.terms.length === 0) return { slugs: [], total: 0 };

	const { sql: where, binds } = buildWhere(parsed, filter);
	const countRow = await db
		.prepare(
			`SELECT COUNT(*) AS c FROM (SELECT t.post_id ${FROM} WHERE ${where} GROUP BY t.post_id)`
		)
		.bind(...binds)
		.first<{ c: number }>();
	const total = Number(countRow?.c ?? 0);
	if (total === 0) return { slugs: [], total: 0 };

	const limit = opts.limit ?? DEFAULT_LIMIT;
	const offset = opts.offset ?? 0;
	const byViews = filter?.sort === 'views';
	// D1/SQLite constraint: bm25 can't be nested in aggregates or outer GROUP BY subqueries →
	// the relevance path fetches hit rows once (incl. cross-locale dupes), JS dedupes per post (first row = best score), then paginates in memory
	const select = byViews
		? `SELECT p.slug AS slug ${FROM} WHERE ${where} GROUP BY t.post_id ORDER BY MAX(p.views) DESC, MAX(p.published_at) DESC LIMIT ? OFFSET ?`
		: `SELECT p.slug AS slug ${FROM} WHERE ${where} GROUP BY t.post_id ORDER BY MAX(p.published_at) DESC LIMIT ? OFFSET ?`;

	if (byViews || parsed.ftsTerms.length === 0) {
		const rows = await db
			.prepare(select)
			.bind(...binds, limit, offset)
			.all<{ slug: string }>();
		return { slugs: rows.results.map((r) => r.slug), total };
	}

	const ranked = await db
		.prepare(
			`SELECT p.slug AS slug, bm25(posts_fts, ${BM25_WEIGHTS}) AS score ${FROM} WHERE ${where} ORDER BY score LIMIT ${SCAN_CAP}`
		)
		.bind(...binds)
		.all<{ slug: string }>();
	const seen = new Set<string>();
	const slugs: string[] = [];
	for (const r of ranked.results) {
		if (seen.has(r.slug)) continue;
		seen.add(r.slug);
		slugs.push(r.slug);
	}
	// zero assumptions about id format (posts.id has both 'post:slug' and uuid eras; slug is the stable key)
	return { slugs: slugs.slice(offset, offset + limit), total };
}

/**
 * Site-wide post search (Phase 51). Long terms → bm25 weighted (title 10 / summary 3 / body 1, best across locales);
 * short terms only → fall back to publish-date order.
 */
export async function searchPosts(
	db: D1Database,
	locale: Locale,
	rawQuery: string,
	opts: SearchPageOptions = {}
): Promise<SearchResponse> {
	const parsed = parseQuery(rawQuery);
	if (parsed.terms.length === 0) return { results: [], total: 0, terms: [] };

	const { slugs, total } = await searchRankedIds(db, rawQuery, opts);
	const posts = await getPostSummariesBySlugs(db, locale, slugs);
	const bySlug = new Map(posts.map((p) => [p.slug, p]));
	const results: SearchResult[] = slugs
		.map((slug) => {
			const post = bySlug.get(slug);
			if (!post) return null;
			return {
				post,
				titleHtml: highlightHtml(post.title, parsed.terms),
				summaryHtml: highlightHtml(post.summary, parsed.terms)
			};
		})
		.filter((r): r is SearchResult => r !== null);

	return { results, total, terms: parsed.terms };
}

/**
 * /blog embedded search (Phase 51.5): full-text hits × tag × year × sort × pagination,
 * returns slug order (feeds the grid cards; no highlighting).
 */
export async function searchBlogPostSummaries(
	db: D1Database,
	locale: Locale,
	rawQuery: string,
	filter: BlogFilterState,
	opts: SearchPageOptions = {}
): Promise<{ posts: PostSummary[]; total: number }> {
	const { slugs, total } = await searchRankedIds(db, rawQuery, opts, filter);
	const posts = await getPostSummariesBySlugs(db, locale, slugs);
	return { posts, total };
}
