import { eq, and } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { postSeo } from '$lib/server/db/schema';
import { robotsContent } from '$lib/meta';
import { site } from '$lib/site';
import type { Locale } from '$lib/paraglide/runtime';

/** writable post_seo fields (empty string = clear the override → NULL) */
export interface SeoPatch {
	seoTitle?: string | null;
	seoDescription?: string | null;
	seoAuthor?: string | null;
	canonicalUrl?: string | null;
	robotsIndex?: boolean;
	robotsFollow?: boolean;
	maxSnippet?: number | null;
	maxImagePreview?: string | null;
	ogTitle?: string | null;
	ogDescription?: string | null;
	ogImage?: string | null;
	ogImageAlt?: string | null;
	twitterCard?: string | null;
	schemaType?: string | null;
}

export type SeoRow = typeof postSeo.$inferSelect;

const norm = (v: unknown): string | null => {
	const s = String(v ?? '').trim();
	return s === '' ? null : s;
};

const MAX_IMAGE = new Set(['large', 'standard', 'none']);
const SCHEMA_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle']);
const TWITTER_CARDS = new Set(['summary', 'summary_large_image']);

export const SCHEMA_TYPE_DEFAULT = 'Article';

/** read a locale's SEO overrides (no row = null; everything falls back) */
export async function getPostSeo(db: Parameters<typeof getDb>[0], postId: string, locale: Locale) {
	const kit = getDb(db);
	const [row] = await kit
		.select()
		.from(postSeo)
		.where(and(eq(postSeo.postId, postId), eq(postSeo.locale, locale)))
		.limit(1);
	return row ?? null;
}

/** upsert (shared by admin forms and agent tools; invalid values silently degrade to defaults) */
export async function upsertPostSeo(
	db: Parameters<typeof getDb>[0],
	postId: string,
	locale: Locale,
	patch: SeoPatch
): Promise<SeoRow> {
	const kit = getDb(db);
	const snippetRaw = patch.maxSnippet;
	const snippet =
		snippetRaw == null || snippetRaw === ('' as unknown)
			? null
			: Number.isFinite(Number(snippetRaw))
				? Math.max(-1, Math.floor(Number(snippetRaw)))
				: null;
	const values = {
		seoTitle: norm(patch.seoTitle ?? undefined) ?? null,
		seoDescription: norm(patch.seoDescription ?? undefined) ?? null,
		seoAuthor: norm(patch.seoAuthor ?? undefined) ?? null,
		canonicalUrl: norm(patch.canonicalUrl ?? undefined) ?? null,
		robotsIndex: patch.robotsIndex ?? true,
		robotsFollow: patch.robotsFollow ?? true,
		maxSnippet: snippet,
		maxImagePreview:
			patch.maxImagePreview && MAX_IMAGE.has(patch.maxImagePreview) ? patch.maxImagePreview : null,
		ogTitle: norm(patch.ogTitle ?? undefined) ?? null,
		ogDescription: norm(patch.ogDescription ?? undefined) ?? null,
		ogImage: norm(patch.ogImage ?? undefined) ?? null,
		ogImageAlt: norm(patch.ogImageAlt ?? undefined) ?? null,
		twitterCard:
			patch.twitterCard && TWITTER_CARDS.has(patch.twitterCard) ? patch.twitterCard : null,
		schemaType:
			patch.schemaType && SCHEMA_TYPES.has(patch.schemaType)
				? patch.schemaType
				: SCHEMA_TYPE_DEFAULT,
		updatedAt: new Date()
	};
	await kit
		.insert(postSeo)
		.values({ postId, locale, ...values })
		.onConflictDoUpdate({ target: [postSeo.postId, postSeo.locale], set: values });
	const row = await getPostSeo(db, postId, locale);
	return (row ?? { postId, locale, ...values }) as SeoRow;
}

/** parsed head overrides (for the blog loader; all optional = undefined when not overridden) */
export interface SeoResolved {
	title?: string;
	description?: string;
	canonical?: string;
	robots?: string;
}

/** canonical tolerance: relative paths get site.url prefixed; non-http(s) values count as invalid */
export function absCanonical(raw: string | null | undefined): string | undefined {
	const s = norm(raw);
	if (!s) return undefined;
	if (s.startsWith('/')) return site.url + s;
	if (/^https?:\/\//i.test(s)) return s;
	return undefined;
}

/** SEO row → buildMeta override set (fallback values passed by the caller) */
export function resolveSeo(
	row: SeoRow | null,
	fallbacks: { title: string; description: string }
): SeoResolved {
	if (!row) return {};
	const out: SeoResolved = {};
	const t = norm(row.seoTitle);
	if (t && t !== fallbacks.title) out.title = t;
	const d = norm(row.seoDescription);
	if (d && d !== fallbacks.description) out.description = d;
	const c = absCanonical(row.canonicalUrl);
	if (c) out.canonical = c;
	const r = robotsContent({
		index: row.robotsIndex,
		follow: row.robotsFollow,
		maxSnippet: row.maxSnippet,
		maxImagePreview: row.maxImagePreview
	});
	if (r) out.robots = r;
	return out;
}
