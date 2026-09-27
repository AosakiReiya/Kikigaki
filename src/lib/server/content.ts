import { and, desc, eq, isNotNull, lte, min, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from './db';
import type { D1Database } from '@cloudflare/workers-types';
import {
	categories,
	categoryTranslations,
	postTranslations,
	postTags,
	posts,
	series,
	seriesPosts,
	seriesTranslations,
	tags,
	tagTranslations
} from './db/schema';
import { computeReadingMinutes, renderMarkdown } from '$lib/markdown';
import { customComponentNames } from './components';
import { emit } from '$lib/plugins';
import type { TocItem } from '$lib/markdown';
import { locales } from '$lib/paraglide/runtime';
import type { Locale } from '$lib/paraglide/runtime';
import type { BlogFilterState, BlogSort } from '$lib/blog-params';

/** base language (untranslated posts fall back to this locale's content) */
export const BASE_LOCALE: Locale = 'zh-tw';

const trActive = alias(postTranslations, 'tr_active');
const trBase = alias(postTranslations, 'tr_base');
const trTag = alias(tagTranslations, 'tr_tag');
const trCat = alias(categoryTranslations, 'tr_cat');
const trSrs = alias(seriesTranslations, 'tr_srs');

/** tag ref: name = base name (URL identity, constant); display = current-locale display name (falls back to base) */
export interface TagRef {
	name: string;
	display: string;
}

/** public post shape (dates as YYYY-MM-DD strings, body already rendered HTML) */
export interface Post {
	slug: string;
	title: string;
	summary: string;
	cover?: string;
	/** category slug (Phase 55: posts.type semantics; for filtering/matching) */
	type: string;
	/** category display name (current locale, falls back to base name then raw slug) */
	categoryDisplay: string;
	date: string;
	/** last updated (for article:modified_time / JSON-LD dateModified) */
	updatedAt: string;
	tags: TagRef[];
	/** full markdown (for editor / import) */
	body: string;
	/** home-page pinned */
	pinned: boolean;
	/** reading time (minutes) */
	readingMinutes: number;
	/** table of contents built from h2 / h3 */
	toc: TocItem[];
	/** rendered post HTML */
	contentHtml: string;
	/** true = current-locale translation exists; false = fell back to base-language original */
	translated: boolean;
	/** locales that actually have translations (for hreflang / sitemap) */
	availableLocales: Locale[];
}

interface PostRow {
	slug: string;
	title: string;
	summary: string;
	cover: string | null;
	type: string;
	body: string | null;
	pinned: boolean;
	publishedAt: Date | null;
	updatedAt: Date;
	translated: number;
}

interface SummaryRow {
	slug: string;
	title: string;
	summary: string;
	cover: string | null;
	type: string;
	pinned: boolean;
	publishedAt: Date | null;
	views: number;
	translated: number;
}

/** publishedAt → YYYY-MM-DD */
function dateString(publishedAt: Date | null): string {
	return publishedAt ? publishedAt.toISOString().slice(0, 10) : '';
}

/** COALESCE column set: current-locale translation → base-language fallback */
function translatedFields(withBody: boolean) {
	return {
		slug: posts.slug,
		title: sql<string>`COALESCE(${trActive.title}, ${trBase.title})`.as('title'),
		summary: sql<string>`COALESCE(${trActive.summary}, ${trBase.summary})`.as('summary'),
		cover: posts.cover,
		type: posts.type,
		pinned: posts.pinned,
		publishedAt: posts.publishedAt,
		updatedAt: posts.updatedAt,
		views: posts.views,
		translated: sql<number>`CASE WHEN ${trActive.id} IS NULL THEN 0 ELSE 1 END`.as('translated'),
		...(withBody
			? { body: sql<string>`COALESCE(${trActive.body}, ${trBase.body}, '')`.as('body') }
			: {})
	};
}

/** fill out the public shape (render + reading time; custom component names for ::: recognition) */
function hydrate(
	row: PostRow,
	tagsOfPost: TagRef[],
	localesOfPost: Locale[],
	categoryDisplay: string,
	customNames?: Set<string>
): Post {
	const body = row.body ?? '';
	const { html, toc } = renderMarkdown(body, customNames);
	return {
		slug: row.slug,
		title: row.title,
		summary: row.summary,
		cover: row.cover ?? undefined,
		type: row.type,
		categoryDisplay,
		date: dateString(row.publishedAt),
		updatedAt: row.updatedAt
			? row.updatedAt.toISOString().slice(0, 10)
			: dateString(row.publishedAt),
		tags: tagsOfPost,
		body,
		pinned: row.pinned,
		readingMinutes: computeReadingMinutes(body),
		toc,
		contentHtml: html,
		translated: row.translated === 1,
		availableLocales: localesOfPost
	};
}

type Db = D1Database;

function toLocales(raw: string[]): Locale[] {
	return raw.filter((l): l is Locale => (locales as readonly string[]).includes(l));
}

/** batch-fill tags (one join query avoids N+1; display names COALESCE to base by locale) */
async function tagsBySlug(db: Db, slugs: string[], locale: Locale): Promise<Map<string, TagRef[]>> {
	if (slugs.length === 0) return new Map();
	const kit = getDb(db);
	const links = await kit
		.select({
			postSlug: posts.slug,
			name: tags.name,
			display: sql<string>`COALESCE(${trTag.name}, ${tags.name})`.as('display')
		})
		.from(postTags)
		.innerJoin(posts, eq(postTags.postId, posts.id))
		.innerJoin(tags, eq(postTags.tagId, tags.id))
		.leftJoin(trTag, and(eq(trTag.tagId, tags.id), eq(trTag.locale, locale)))
		.where(
			sql`${posts.slug} IN (${sql.join(
				slugs.map((s) => sql`${s}`),
				sql`, `
			)})`
		);
	const map = new Map<string, TagRef[]>();
	for (const l of links) {
		const arr = map.get(l.postSlug) ?? [];
		arr.push({ name: l.name, display: l.display });
		map.set(l.postSlug, arr);
	}
	return map;
}

/** batch-fill category display names (slug → current-locale translation; slugs missing from the table are reverted to raw by callers) */
async function categoryDisplays(
	db: Db,
	types: string[],
	locale: Locale
): Promise<Map<string, string>> {
	const unique = [...new Set(types)];
	if (unique.length === 0) return new Map();
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: categories.slug,
			display: sql<string>`COALESCE(${trCat.name}, ${categories.name})`.as('display')
		})
		.from(categories)
		.leftJoin(trCat, and(eq(trCat.categoryId, categories.id), eq(trCat.locale, locale)))
		.where(
			sql`${categories.slug} IN (${sql.join(
				unique.map((t) => sql`${t}`),
				sql`, `
			)})`
		);
	return new Map(rows.map((r) => [r.slug, r.display]));
}

/** batch-fill the "locales with translations" list (for hreflang / sitemap / badges) */
async function localesBySlug(db: Db, slugs: string[]): Promise<Map<string, Locale[]>> {
	if (slugs.length === 0) return new Map();
	const kit = getDb(db);
	const links = await kit
		.select({ postSlug: posts.slug, locale: postTranslations.locale })
		.from(postTranslations)
		.innerJoin(posts, eq(postTranslations.postId, posts.id))
		.where(
			sql`${posts.slug} IN (${sql.join(
				slugs.map((s) => sql`${s}`),
				sql`, `
			)})`
		);
	const map = new Map<string, Locale[]>();
	for (const l of links) {
		const arr = map.get(l.postSlug) ?? [];
		arr.push(...toLocales([l.locale]));
		map.set(l.postSlug, arr);
	}
	return map;
}

/** slim shape for lists (no markdown render; keeps list pages light) */
export interface PostSummary {
	slug: string;
	title: string;
	summary: string;
	cover?: string;
	/** category slug (Phase 55; for /blog?type= filtering and badge conditions) */
	type: string;
	/** category display name (current locale) */
	categoryDisplay: string;
	date: string;
	tags: TagRef[];
	pinned: boolean;
	/** view count (for /blog sorting and lists) */
	views: number;
	/** true = current-locale translation exists; false = showing the base-language original */
	translated: boolean;
	/** locales with translations (for hreflang / sitemap) */
	availableLocales: Locale[];
}

function hydrateSummary(
	row: SummaryRow,
	tagsOfPost: TagRef[],
	localesOfPost: Locale[],
	categoryDisplay: string
): PostSummary {
	return {
		slug: row.slug,
		title: row.title,
		summary: row.summary,
		cover: row.cover ?? undefined,
		type: row.type,
		categoryDisplay,
		date: dateString(row.publishedAt),
		tags: tagsOfPost,
		pinned: row.pinned,
		views: row.views,
		translated: row.translated === 1,
		availableLocales: localesOfPost
	};
}

/** pagination options (limit/offset) */
export interface PageOptions {
	limit?: number;
	offset?: number;
}

/** posts per page for lists (shared by home and tag pages) */
export const PAGE_SIZE = 12;

/** published post list (publish date new→old; content falls back to base by locale) */

/**
 * Phase 67 scheduled publishing: published=0 with publishedAt due → flip to published and emit post:published.
 * lazy publish: runs opportunistically before layout.server / RSS / sitemap / admin list reads (zero writes when nothing is due).
 */
let lastDueProbe = 0;
export async function publishDuePosts(db: Db): Promise<string[]> {
	// 60s in-isolate throttle: sites with nothing due skip probing on 99% of requests (max schedule delay 60s + first request; acceptable)
	const t = Date.now();
	if (t - lastDueProbe < 60_000) return [];
	lastDueProbe = t;
	const now = new Date();
	const kit = getDb(db);
	const due = await kit
		.select({ id: posts.id, slug: posts.slug })
		.from(posts)
		.where(
			and(eq(posts.published, false), isNotNull(posts.publishedAt), lte(posts.publishedAt, now))
		)
		.all();
	const flipped: string[] = [];
	for (const r of due) {
		await kit.update(posts).set({ published: true, updatedAt: now }).where(eq(posts.id, r.id));
		flipped.push(r.slug);
	}
	// events emitted after the non-transactional loop (search index, activity stamps and other subscribers)
	for (const r of due) {
		await emit('post:published', { slug: r.slug, locale: 'zh-tw', published: true }, { db });
	}
	return flipped;
}

export async function getPublishedPostSummaries(
	db: Db,
	locale: Locale,
	opts: PageOptions = {}
): Promise<PostSummary[]> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(false))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)));
	const rows = (await query
		.where(and(eq(posts.published, true), eq(posts.seriesOnly, false)))
		.orderBy(desc(posts.publishedAt))
		.limit(opts.limit ?? 10_000)
		.offset(opts.offset ?? 0)) as SummaryRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrateSummary(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type
		)
	);
}

/** total published posts (for pagination) */
export async function getPublishedPostCount(db: Db): Promise<number> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(posts)
		.where(and(eq(posts.published, true), eq(posts.seriesOnly, false)));
	return Number(row?.count ?? 0);
}

/** post summaries for a given slug set (keeps input order = search score order; published only) */
export async function getPostSummariesBySlugs(
	db: Db,
	locale: Locale,
	slugs: string[]
): Promise<PostSummary[]> {
	if (slugs.length === 0) return [];
	const kit = getDb(db);
	const rows = (await kit
		.select(translatedFields(false))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)))
		.where(
			and(
				eq(posts.published, true),
				sql`${posts.slug} IN (${sql.join(
					slugs.map((s) => sql`${s}`),
					sql`, `
				)})`
			)
		)) as SummaryRow[];
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	const present = slugs.filter((s) => bySlug.has(s));
	if (present.length === 0) return [];
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, present, locale),
		localesBySlug(db, present),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return present.map((s) => {
		const row = bySlug.get(s)!;
		return hydrateSummary(
			row,
			tagsMap.get(s) ?? [],
			localesMap.get(s) ?? [],
			catMap.get(row.type) ?? row.type
		);
	});
}

/** publish-year SQL (published_at is ms → unixepoch seconds) */
const yearSql = sql<number>`CAST(strftime('%Y', ${posts.publishedAt} / 1000, 'unixepoch') AS INTEGER)`;

/**
 * List visibility (Phase 58.6): series_only posts exit all list contexts by default;
 * series-filtered views (book context) admit them naturally, and the sonly toggle shows only them.
 */
function listVisibility(filter: Pick<BlogFilterState, 'series' | 'sonly'>) {
	if (filter.series) return [];
	return [eq(posts.seriesOnly, filter.sonly === true)];
}

/** /blog filter conditions (shared by list and count; tag × type × year × series × sonly stack) */
function blogWhere(filter: BlogFilterState) {
	const conds = [eq(posts.published, true), ...listVisibility(filter)];
	if (filter.tag) conds.push(eq(tags.name, filter.tag));
	if (filter.type) conds.push(eq(posts.type, filter.type));
	if (filter.year) conds.push(sql`${yearSql} = ${filter.year}`);
	if (filter.series) conds.push(eq(series.slug, filter.series));
	return and(...conds);
}

/** /blog sorting: new = publish date ↓; views = view count ↓ then date ↓ */
function blogOrder(sort: BlogSort) {
	return sort === 'views'
		? [desc(posts.views), desc(posts.publishedAt)]
		: [desc(posts.publishedAt)];
}

/** /blog post list (tag × year × sort × pagination; content falls back to base by locale) */
export async function getBlogPostSummaries(
	db: Db,
	locale: Locale,
	filter: BlogFilterState,
	opts: PageOptions = {}
): Promise<PostSummary[]> {
	const kit = getDb(db);
	const base = kit
		.select(translatedFields(false))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)));
	let query = filter.tag
		? base
				.innerJoin(postTags, eq(postTags.postId, posts.id))
				.innerJoin(tags, eq(postTags.tagId, tags.id))
		: base;
	if (filter.series) {
		query = query
			.innerJoin(seriesPosts, eq(seriesPosts.postId, posts.id))
			.innerJoin(series, and(eq(series.id, seriesPosts.seriesId), eq(series.published, true)));
	}
	const rows = (await query
		.where(blogWhere(filter))
		.orderBy(...blogOrder(filter.sort))
		.limit(opts.limit ?? 10_000)
		.offset(opts.offset ?? 0)) as SummaryRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrateSummary(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type
		)
	);
}

/** /blog total posts matching the filters (for pagination) */
export async function getBlogPostCount(db: Db, filter: BlogFilterState): Promise<number> {
	const kit = getDb(db);
	const base = kit.select({ count: sql<number>`count(*)` }).from(posts);
	const [row] = await (
		filter.series
			? (filter.tag
					? base
							.innerJoin(postTags, eq(postTags.postId, posts.id))
							.innerJoin(tags, eq(postTags.tagId, tags.id))
					: base
				)
					.innerJoin(seriesPosts, eq(seriesPosts.postId, posts.id))
					.innerJoin(series, and(eq(series.id, seriesPosts.seriesId), eq(series.published, true)))
			: filter.tag
				? base
						.innerJoin(postTags, eq(postTags.postId, posts.id))
						.innerJoin(tags, eq(postTags.tagId, tags.id))
				: base
	).where(blogWhere(filter));
	return Number(row?.count ?? 0);
}

/** year × count (for the /blog sidebar archive) */
export interface YearStat {
	year: number;
	count: number;
}

/** per-year stats of published posts (new→old; undated excluded) */
export async function getPostYearStats(db: Db): Promise<YearStat[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({ year: yearSql, count: sql<number>`count(*)` })
		.from(posts)
		.where(and(eq(posts.published, true), eq(posts.seriesOnly, false)))
		.groupBy(yearSql)
		.orderBy(sql`1 desc`);
	return rows
		.map((r) => ({ year: Number(r.year), count: Number(r.count) }))
		.filter((r) => Number.isFinite(r.year) && r.year > 0);
}

/** category list (sidebar "Categories" group; only categories with published posts, sorted by sort → post count) */
export interface CategoryCount {
	slug: string;
	display: string;
	count: number;
}

export async function getCategories(db: Db, locale: Locale): Promise<CategoryCount[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: categories.slug,
			display: sql<string>`COALESCE(${trCat.name}, ${categories.name})`.as('display'),
			count: sql<number>`count(*)`
		})
		.from(categories)
		.leftJoin(trCat, and(eq(trCat.categoryId, categories.id), eq(trCat.locale, locale)))
		.innerJoin(posts, eq(posts.type, categories.slug))
		.where(and(eq(posts.published, true), eq(posts.seriesOnly, false)))
		.groupBy(categories.id)
		.orderBy(sql`${categories.sort} asc`, sql`count(*) desc`);
	return rows.map((r) => ({ slug: r.slug, display: r.display, count: Number(r.count) }));
}

/** pinned posts (home horizontal cards; no pagination, always shown) */
export async function getPinnedPostSummaries(db: Db, locale: Locale): Promise<PostSummary[]> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(false))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)));
	const rows = (await query
		.where(and(eq(posts.published, true), eq(posts.pinned, true), eq(posts.seriesOnly, false)))
		.orderBy(desc(posts.publishedAt))) as SummaryRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrateSummary(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type
		)
	);
}

/** posts for a given tag (paginated) */
export async function getPostsByTagSummaries(
	db: Db,
	tagName: string,
	locale: Locale,
	opts: PageOptions = {}
): Promise<PostSummary[]> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(false))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)))
		.innerJoin(postTags, eq(postTags.postId, posts.id))
		.innerJoin(tags, eq(postTags.tagId, tags.id));
	const rows = (await query
		.where(and(eq(tags.name, tagName), eq(posts.published, true), eq(posts.seriesOnly, false)))
		.orderBy(desc(posts.publishedAt))
		.limit(opts.limit ?? 10_000)
		.offset(opts.offset ?? 0)) as SummaryRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrateSummary(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type
		)
	);
}

/** total posts for a given tag (for pagination) */
export async function getPostsByTagCount(db: Db, tagName: string): Promise<number> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(posts)
		.innerJoin(postTags, eq(postTags.postId, posts.id))
		.innerJoin(tags, eq(postTags.tagId, tags.id))
		.where(and(eq(tags.name, tagName), eq(posts.published, true), eq(posts.seriesOnly, false)));
	return Number(row?.count ?? 0);
}

/** all published posts (publish date new→old) */
export async function getPublishedPosts(db: Db, locale: Locale): Promise<Post[]> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(true))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)));
	const rows = (await query
		.where(eq(posts.published, true))
		.orderBy(desc(posts.publishedAt))) as PostRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, names, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		customComponentNames(db),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrate(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type,
			names
		)
	);
}

/** single post (with content); drafts/missing return undefined. Falls back to base without a translation */
export async function getPost(db: Db, slug: string, locale: Locale): Promise<Post | undefined> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(true))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)));
	const rows = (await query
		.where(and(eq(posts.slug, slug), eq(posts.published, true)))
		.limit(1)) as PostRow[];
	if (rows.length === 0) return undefined;
	const [tagsMap, localesMap, names, catMap] = await Promise.all([
		tagsBySlug(db, [slug], locale),
		localesBySlug(db, [slug]),
		customComponentNames(db),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return hydrate(
		rows[0],
		tagsMap.get(slug) ?? [],
		localesMap.get(slug) ?? [],
		catMap.get(rows[0].type) ?? rows[0].type,
		names
	);
}

/** all tags (by post count desc; display names per locale) */
export async function getTags(
	db: Db,
	locale: Locale
): Promise<{ name: string; display: string; count: number }[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			name: tags.name,
			display: sql<string>`COALESCE(${trTag.name}, ${tags.name})`.as('display'),
			count: sql<number>`count(*)`
		})
		.from(tags)
		.leftJoin(trTag, and(eq(trTag.tagId, tags.id), eq(trTag.locale, locale)))
		.innerJoin(postTags, eq(postTags.tagId, tags.id))
		.innerJoin(posts, eq(postTags.postId, posts.id))
		.where(and(eq(posts.published, true), eq(posts.seriesOnly, false)))
		.groupBy(tags.id)
		.orderBy(sql`count(*) desc`);
	return rows.map((r) => ({ name: r.name, display: r.display, count: Number(r.count) }));
}

/** a single tag's locale display name (for tag-page titles; missing returns the base name) */
export async function getTagDisplay(db: Db, name: string, locale: Locale): Promise<string> {
	const kit = getDb(db);
	const [row] = await kit
		.select({
			display: sql<string>`COALESCE(MAX(${trTag.name}), ${tags.name})`.as('display')
		})
		.from(tags)
		.leftJoin(trTag, and(eq(trTag.tagId, tags.id), eq(trTag.locale, locale)))
		.where(eq(tags.name, name))
		.groupBy(tags.id)
		.limit(1);
	return row?.display ?? name;
}

/** posts for a given tag */
export async function getPostsByTag(db: Db, tagName: string, locale: Locale): Promise<Post[]> {
	const kit = getDb(db);
	const query = kit
		.select(translatedFields(true))
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)))
		.innerJoin(postTags, eq(postTags.postId, posts.id))
		.innerJoin(tags, eq(postTags.tagId, tags.id));
	const rows = (await query
		.where(and(eq(tags.name, tagName), eq(posts.published, true), eq(posts.seriesOnly, false)))
		.orderBy(desc(posts.publishedAt))) as PostRow[];
	if (rows.length === 0) return [];
	const slugs = rows.map((r) => r.slug);
	const [tagsMap, localesMap, names, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		customComponentNames(db),
		categoryDisplays(
			db,
			rows.map((r) => r.type),
			locale
		)
	]);
	return rows.map((r) =>
		hydrate(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type,
			names
		)
	);
}

/** adjacent posts (prev/next under date ordering) — order shared site-wide, titles in current locale */
export async function getAdjacentPosts(
	db: Db,
	slug: string,
	locale: Locale
): Promise<{ prev?: PostSummary; next?: PostSummary }> {
	const all = await getPublishedPostSummaries(db, locale);
	const i = all.findIndex((p) => p.slug === slug);
	if (i === -1) return {};
	return {
		prev: all[i + 1],
		next: all[i - 1]
	};
}

/* =====================  Series (Phase 58/58.2 books)  ===================== */

/** series index card (published bookshelf; in_book by published + published chapter count) */
export interface SeriesCard {
	slug: string;
	title: string;
	summary: string;
	cover?: string;
	count: number;
	updatedAt?: number;
}

/** bookshelf page size (Phase 58.6) */
export const SERIES_PAGE_SIZE = 9;

export async function getSeriesIndex(
	db: Db,
	locale: Locale,
	opts: PageOptions = {}
): Promise<SeriesCard[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: series.slug,
			cover: series.cover,
			title:
				sql<string>`COALESCE(${trSrs.title}, MAX(CASE WHEN ${seriesTranslations.locale} = ${BASE_LOCALE} THEN ${seriesTranslations.title} END))`.as(
					'title'
				),
			summary:
				sql<string>`COALESCE(${trSrs.summary}, MAX(CASE WHEN ${seriesTranslations.locale} = ${BASE_LOCALE} THEN ${seriesTranslations.summary} END))`.as(
					'summary'
				),
			count: sql<number>`count(distinct ${posts.id})`,
			updatedAt: series.updatedAt
		})
		.from(series)
		.leftJoin(seriesTranslations, eq(seriesTranslations.seriesId, series.id))
		.leftJoin(trSrs, and(eq(trSrs.seriesId, series.id), eq(trSrs.locale, locale)))
		.leftJoin(seriesPosts, eq(seriesPosts.seriesId, series.id))
		.leftJoin(posts, and(eq(posts.id, seriesPosts.postId), eq(posts.published, true)))
		.where(eq(series.published, true))
		.groupBy(series.id)
		.orderBy(desc(series.createdAt))
		.limit(opts.limit ?? 10_000)
		.offset(opts.offset ?? 0);
	return rows.map((r) => ({
		slug: r.slug,
		title: r.title ?? r.slug,
		summary: r.summary ?? '',
		cover: r.cover ?? undefined,
		count: Number(r.count),
		updatedAt: Number(r.updatedAt)
	}));
}

/** total published books (for bookshelf pagination) */
export async function getSeriesCount(db: Db): Promise<number> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(series)
		.where(eq(series.published, true));
	return Number(row?.count ?? 0);
}

/** book body + chapters (published chapter summaries by position) */
export interface BookMeta {
	slug: string;
	title: string;
	summary: string;
	cover?: string;
}

export interface SeriesBook {
	book: BookMeta;
	chapters: PostSummary[];
}

async function getBookMeta(
	kit: ReturnType<typeof getDb>,
	slug: string,
	locale: Locale
): Promise<BookMeta | undefined> {
	const rows = await kit
		.select({
			id: series.id,
			slug: series.slug,
			cover: series.cover,
			title:
				sql<string>`COALESCE(${trSrs.title}, MAX(CASE WHEN ${seriesTranslations.locale} = ${BASE_LOCALE} THEN ${seriesTranslations.title} END))`.as(
					'title'
				),
			summary:
				sql<string>`COALESCE(${trSrs.summary}, MAX(CASE WHEN ${seriesTranslations.locale} = ${BASE_LOCALE} THEN ${seriesTranslations.summary} END))`.as(
					'summary'
				)
		})
		.from(series)
		.leftJoin(seriesTranslations, eq(seriesTranslations.seriesId, series.id))
		.leftJoin(trSrs, and(eq(trSrs.seriesId, series.id), eq(trSrs.locale, locale)))
		.where(and(eq(series.slug, slug), eq(series.published, true)))
		.groupBy(series.id)
		.limit(1);
	const r = rows[0];
	if (!r) return undefined;
	return {
		slug: r.slug,
		title: r.title ?? r.slug,
		summary: r.summary ?? '',
		cover: r.cover ?? undefined
	};
}

/** ordered chapter summaries of a book (published chapters, position order; batch hydration) */
async function getChaptersOfBook(
	db: Db,
	kit: ReturnType<typeof getDb>,
	bookId: string,
	locale: Locale
) {
	const members = await kit
		.select({ postId: seriesPosts.postId })
		.from(seriesPosts)
		.innerJoin(posts, and(eq(posts.id, seriesPosts.postId), eq(posts.published, true)))
		.where(eq(seriesPosts.seriesId, bookId))
		.orderBy(seriesPosts.position);
	const ids = members.map((m) => m.postId);
	if (ids.length === 0) return [] as PostSummary[];
	const rows = (await kit
		.select({ id: posts.id, ...translatedFields(false) })
		.from(posts)
		.leftJoin(trActive, and(eq(trActive.postId, posts.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.postId, posts.id), eq(trBase.locale, BASE_LOCALE)))
		.where(
			sql`${posts.id} IN (${sql.join(
				ids.map((x) => sql`${x}`),
				sql`, `
			)})`
		)) as (SummaryRow & { id: string })[];
	const byId = new Map(rows.map((r) => [r.id, r]));
	const ordered = ids
		.map((id) => byId.get(id))
		.filter((r): r is SummaryRow & { id: string } => !!r);
	const slugs = ordered.map((r) => r.slug);
	const [tagsMap, localesMap, catMap] = await Promise.all([
		tagsBySlug(db, slugs, locale),
		localesBySlug(db, slugs),
		categoryDisplays(
			db,
			ordered.map((r) => r.type),
			locale
		)
	]);
	return ordered.map((r) =>
		hydrateSummary(
			r,
			tagsMap.get(r.slug) ?? [],
			localesMap.get(r.slug) ?? [],
			catMap.get(r.type) ?? r.type
		)
	);
}

export async function getSeriesBook(
	db: Db,
	locale: Locale,
	slug: string
): Promise<SeriesBook | undefined> {
	const kit = getDb(db);
	const book = await getBookMeta(kit, slug, locale);
	if (!book) return undefined;
	return { book, chapters: await getChaptersOfBook(db, kit, `series:${slug}`, locale) };
}

/** chapter reading view (book + chapter list + current chapter full text + prev/next); chapter not in this book returns null (route 404) */
export interface BookReading {
	book: BookMeta;
	chapters: PostSummary[];
	current: Post;
	prev?: PostSummary;
	next?: PostSummary;
}

export async function getChapterForBook(
	db: Db,
	locale: Locale,
	slug: string,
	chapterSlug: string
): Promise<BookReading | 'no-book' | 'no-chapter'> {
	const book0 = await getSeriesBook(db, locale, slug);
	if (!book0) return 'no-book';
	const i = book0.chapters.findIndex((c) => c.slug === chapterSlug);
	if (i === -1) return 'no-chapter';
	const current = await getPost(db, chapterSlug, locale);
	if (!current) return 'no-chapter';
	return {
		...book0,
		current,
		prev: book0.chapters[i - 1],
		next: book0.chapters[i + 1]
	};
}

/** the book a post belongs to (published books only; for fine links and isPartOf — reading navigation is the book page's job) */
export interface BookRef {
	slug: string;
	title: string;
}

export async function getPostBooks(db: Db, locale: Locale, postSlug: string): Promise<BookRef[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: series.slug,
			title:
				sql<string>`COALESCE(${trSrs.title}, MAX(CASE WHEN ${seriesTranslations.locale} = ${BASE_LOCALE} THEN ${seriesTranslations.title} END))`.as(
					'title'
				)
		})
		.from(seriesPosts)
		.innerJoin(posts, eq(posts.id, seriesPosts.postId))
		.innerJoin(series, and(eq(series.id, seriesPosts.seriesId), eq(series.published, true)))
		.leftJoin(seriesTranslations, eq(seriesTranslations.seriesId, series.id))
		.leftJoin(trSrs, and(eq(trSrs.seriesId, series.id), eq(trSrs.locale, locale)))
		.where(eq(posts.slug, postSlug))
		.groupBy(series.id)
		.orderBy(min(seriesPosts.position));
	return rows.map((r) => ({ slug: r.slug, title: r.title ?? r.slug }));
}

/** whether a post_translations row exists for a locale (admin list badges / editability) */
export async function translationLocalesFor(db: Db, slug: string): Promise<Locale[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({ locale: postTranslations.locale })
		.from(postTranslations)
		.innerJoin(posts, eq(postTranslations.postId, posts.id))
		.where(eq(posts.slug, slug));
	return toLocales(rows.map((r) => r.locale));
}

export { postTranslations };
