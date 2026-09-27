/**
 * Custom pages (Phase 20.6) — server access for markdown pages independent of posts.
 * Mirrors the posts translation-fallback pattern (current locale → base zh-tw); bodies go through
 * renderMarkdown supporting `:::` content components (incl. Workshop customs), sharing the posts pipeline.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from './db';
import { pages, pageTranslations } from './db/schema';
import { renderMarkdown } from '$lib/markdown';
import { customComponentNames } from './components';
import { locales, type Locale } from '$lib/paraglide/runtime';
import { BASE_LOCALE } from './content';

export interface PageViewModel {
	slug: string;
	title: string;
	summary: string;
	body: string;
	contentHtml: string;
	published: boolean;
	showInNav: boolean;
	navOrder: number;
	/** true = current-locale translation exists; false = fell back to the base original */
	translated: boolean;
	availableLocales: Locale[];
}

export interface PageSummaryRow {
	slug: string;
	title: string;
	published: boolean;
	showInNav: boolean;
	navOrder: number;
	updatedAt: number;
}

export interface NavLink {
	slug: string;
	title: string;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/** reserved top-level paths: static routes / system routes / locale prefixes — page slugs must not use them */
/** pack-declared context paths must be registered here too (drift locked down by $lib/themes/routes.test.ts) */
export const THEME_ROUTE_SLUGS = [
	'services',
	'contact',
	'press',
	'sections',
	'contents',
	'columns'
];

export const RESERVED_PAGE_SLUGS = [
	'series',
	'dev',
	'admin',
	'api',
	'blog',
	'tags',
	'about',
	'login',
	'logout',
	'media',
	'search',
	'sitemap.xml',
	'rss.xml',
	'feed',
	'robots.txt',
	'favicon.ico',
	'_headers',
	'_redirects',
	...locales
];

export function validatePageSlug(slug: string): string | null {
	if (!SLUG_RE.test(slug)) return 'slug_invalid（小寫英數字開頭結尾，中間可含連字號，≤50 字）';
	// 78f (B1): theme context paths are reserved too (static list anti-drift guarded by routes.test;
	// don't import the registry here — a server pure-function module carrying the component graph would drag tests and the bundle down)
	if (RESERVED_PAGE_SLUGS.includes(slug) || THEME_ROUTE_SLUGS.includes(slug))
		return `slug_reserved（「${slug}」是保留路徑）`;
	return null;
}

const trActive = alias(pageTranslations, 'pt_active');
const trBase = alias(pageTranslations, 'pt_base');

function pageFields() {
	return {
		slug: pages.slug,
		published: pages.published,
		showInNav: pages.showInNav,
		navOrder: pages.navOrder,
		title: sql<string>`COALESCE(${trActive.title}, ${trBase.title}, '')`.as('title'),
		summary: sql<string>`COALESCE(${trActive.summary}, ${trBase.summary}, '')`.as('summary'),
		body: sql<string>`COALESCE(${trActive.body}, ${trBase.body}, '')`.as('body'),
		translatedRaw: trActive.id
	};
}

interface PageJoinRow {
	slug: string;
	published: boolean;
	showInNav: boolean;
	navOrder: number;
	title: string;
	summary: string;
	body: string;
	translatedRaw: string | null;
}

async function localesByPage(db: D1Database, pageIds: string[]): Promise<Map<string, Locale[]>> {
	const map = new Map<string, Locale[]>();
	if (pageIds.length === 0) return map;
	const kit = getDb(db);
	const rows = await kit
		.select({ pageId: pageTranslations.pageId, locale: pageTranslations.locale })
		.from(pageTranslations)
		.where(inArray(pageTranslations.pageId, pageIds));
	for (const r of rows) {
		if (!(locales as readonly string[]).includes(r.locale)) continue;
		const arr = map.get(r.pageId) ?? [];
		arr.push(r.locale as Locale);
		map.set(r.pageId, arr);
	}
	return map;
}

async function renderPage(
	db: D1Database,
	row: PageJoinRow & { id: string },
	availableLocales: Locale[]
): Promise<PageViewModel> {
	const names = await customComponentNames(db);
	const { html } = renderMarkdown(row.body, names);
	return {
		slug: row.slug,
		title: row.title,
		summary: row.summary,
		body: row.body,
		contentHtml: html,
		published: row.published,
		showInNav: row.showInNav,
		navOrder: row.navOrder,
		translated: row.translatedRaw != null,
		availableLocales
	};
}

/** public: published page by slug; falls back to base without a translation; drafts/missing return undefined */
export async function getPublishedPage(
	db: D1Database,
	slug: string,
	locale: Locale
): Promise<PageViewModel | undefined> {
	const kit = getDb(db);
	const rows = (await kit
		.select({ id: pages.id, ...pageFields() })
		.from(pages)
		.leftJoin(trActive, and(eq(trActive.pageId, pages.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.pageId, pages.id), eq(trBase.locale, BASE_LOCALE)))
		.where(and(eq(pages.slug, slug), eq(pages.published, true)))
		.limit(1)) as (PageJoinRow & { id: string })[];
	if (rows.length === 0) return undefined;
	const r = rows[0];
	const locs = await localesByPage(db, [r.id]);
	return renderPage(db, r, locs.get(r.id) ?? []);
}

/** public: navigation page list (published + showInNav; smaller navOrder first, ties by creation order) */
export async function getNavPages(db: D1Database, locale: Locale): Promise<NavLink[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: pages.slug,
			title: sql<string>`COALESCE(${trActive.title}, ${trBase.title}, '')`.as('title')
		})
		.from(pages)
		.leftJoin(trActive, and(eq(trActive.pageId, pages.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.pageId, pages.id), eq(trBase.locale, BASE_LOCALE)))
		.where(and(eq(pages.published, true), eq(pages.showInNav, true)))
		.orderBy(asc(pages.navOrder), asc(pages.createdAt));
	return rows.map((r) => ({ slug: r.slug, title: r.title }));
}

/** for sitemap: slim published-page list (slug / updated / actual translation locales) */
export async function getPublishedPageRefs(
	db: D1Database
): Promise<{ slug: string; lastmod: string; locales: Locale[] }[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({ id: pages.id, slug: pages.slug, updatedAt: pages.updatedAt })
		.from(pages)
		.where(eq(pages.published, true))
		.orderBy(asc(pages.createdAt));
	const locs = await localesByPage(
		db,
		rows.map((r) => r.id)
	);
	return rows.map((r) => ({
		slug: r.slug,
		lastmod: new Date(r.updatedAt).toISOString().slice(0, 10),
		locales: locs.get(r.id) ?? []
	}));
}

/** for the search index: published pages (title + summary; body excluded to keep payloads small) */
export async function getPublishedPageSummaries(
	db: D1Database,
	locale: Locale
): Promise<{ slug: string; title: string; summary: string }[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: pages.slug,
			title: sql<string>`COALESCE(${trActive.title}, ${trBase.title}, '')`.as('title'),
			summary: sql<string>`COALESCE(${trActive.summary}, ${trBase.summary}, '')`.as('summary')
		})
		.from(pages)
		.leftJoin(trActive, and(eq(trActive.pageId, pages.id), eq(trActive.locale, locale)))
		.leftJoin(trBase, and(eq(trBase.pageId, pages.id), eq(trBase.locale, BASE_LOCALE)))
		.where(eq(pages.published, true))
		.orderBy(asc(pages.createdAt));
	return rows.filter((r) => r.title);
}

/* ------------------------------ Admin ------------------------------ */

/** admin list (incl. drafts); base-locale title first, falling back to any available title */
export async function listPagesAdmin(db: D1Database): Promise<PageSummaryRow[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			slug: pages.slug,
			published: pages.published,
			showInNav: pages.showInNav,
			navOrder: pages.navOrder,
			updatedAt: pages.updatedAt,
			title: sql<string>`COALESCE(${trBase.title}, (
				SELECT pt.title FROM page_translations pt WHERE pt.page_id = pages.id LIMIT 1
			), '')`.as('title')
		})
		.from(pages)
		.leftJoin(trBase, and(eq(trBase.pageId, pages.id), eq(trBase.locale, BASE_LOCALE)))
		.orderBy(desc(pages.updatedAt));
	return rows.map((r) => ({ ...r, updatedAt: Number(r.updatedAt) }));
}

export interface PageAdminData {
	page: { slug: string; published: boolean; showInNav: boolean; navOrder: number };
	/** locale → content (locales without content have no key) */
	translations: Record<string, { title: string; summary: string; body: string }>;
}

export async function getPageAdmin(
	db: D1Database,
	slug: string
): Promise<PageAdminData | undefined> {
	const kit = getDb(db);
	const [row] = await kit.select().from(pages).where(eq(pages.slug, slug)).limit(1);
	if (!row) return undefined;
	const trs = await kit.select().from(pageTranslations).where(eq(pageTranslations.pageId, row.id));
	const translations: PageAdminData['translations'] = {};
	for (const t of trs) {
		if (!(locales as readonly string[]).includes(t.locale)) continue;
		translations[t.locale] = { title: t.title, summary: t.summary, body: t.body };
	}
	return {
		page: {
			slug: row.slug,
			published: row.published,
			showInNav: row.showInNav,
			navOrder: row.navOrder
		},
		translations
	};
}

/** create/update (translations only written for locales with content; empty string = delete that locale) */
export async function upsertPage(
	db: D1Database,
	input: {
		slug: string;
		published: boolean;
		showInNav: boolean;
		navOrder: number;
		translations: Record<string, { title: string; summary?: string; body?: string }>;
	}
): Promise<{ ok: true } | { ok: false; error: string }> {
	const slugErr = validatePageSlug(input.slug);
	if (slugErr) return { ok: false, error: slugErr };
	// Phase 44: write-side normalization — bodies always stored with LF (this function is the shared choke point for tools and admin forms)
	input = {
		...input,
		translations: Object.fromEntries(
			Object.entries(input.translations).map(([k, v]) => [
				k,
				{ ...v, body: v.body?.replace(/\r\n?/g, '\n') }
			])
		)
	};

	const kit = getDb(db);
	const now = new Date();
	const [existing] = await kit
		.select({ id: pages.id })
		.from(pages)
		.where(eq(pages.slug, input.slug));

	let pageId = existing?.id;
	if (pageId) {
		await kit
			.update(pages)
			.set({
				published: input.published,
				showInNav: input.showInNav,
				navOrder: input.navOrder,
				updatedAt: now
			})
			.where(eq(pages.id, pageId));
	} else {
		pageId = crypto.randomUUID();
		await kit.insert(pages).values({
			id: pageId,
			slug: input.slug,
			published: input.published,
			showInNav: input.showInNav,
			navOrder: input.navOrder,
			createdAt: now,
			updatedAt: now
		});
	}

	for (const [localeRaw, tr] of Object.entries(input.translations)) {
		if (!(locales as readonly string[]).includes(localeRaw)) continue;
		const locale = localeRaw as Locale;
		const title = (tr.title ?? '').trim();
		const body = tr.body ?? '';
		const summary = tr.summary ?? '';
		if (!title && !body) {
			await kit
				.delete(pageTranslations)
				.where(and(eq(pageTranslations.pageId, pageId), eq(pageTranslations.locale, locale)));
			continue;
		}
		await kit
			.insert(pageTranslations)
			.values({
				id: crypto.randomUUID(),
				pageId,
				locale,
				title: title || '(untitled)',
				summary,
				body,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [pageTranslations.pageId, pageTranslations.locale],
				set: { title: title || '(untitled)', summary, body, updatedAt: now }
			});
	}

	return { ok: true };
}

export async function deletePage(db: D1Database, slug: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(pages).where(eq(pages.slug, slug)); // translations cascade
}
