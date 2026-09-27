/**
 * Phase 79a — content-type registry (single source of site shape).
 *
 * Built-ins mirror what used to be hardcoded inside sitemap/rss/route
 * loaders. Registration order is a contract: consumers that keep output
 * stable (sitemap assembly) rely on it. `registerContentType` is exposed for
 * 79d demo types and tests; 79c's agent tool will be the only *runtime*
 * writer (high-approval gated).
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { postSeo } from '$lib/server/db/schema';
import { BASE_LOCALE, getPublishedPostSummaries, getSeriesIndex } from '$lib/server/content';
import { getPublishedPageRefs } from '$lib/server/pages';
import type { ContentItemRef, ContentTypeManifest } from './types';

const registry = new Map<string, ContentTypeManifest>();

export function registerContentType(manifest: ContentTypeManifest): void {
	if (registry.has(manifest.key)) {
		throw new Error(`content type already registered: ${manifest.key}`);
	}
	registry.set(manifest.key, manifest);
}

export function getContentType(key: string): ContentTypeManifest | undefined {
	return registry.get(key);
}

/** Registration-ordered list (order is a sitemap-output contract). */
export function listContentTypes(): ContentTypeManifest[] {
	return [...registry.values()];
}

/* ------------------------------------------------------------------ builtins */

registerContentType({
	key: 'posts',
	pathFor: (slug) => `/blog/${slug}`,
	listPath: '/blog',
	jsonLdType: 'BlogPosting',
	fields: [
		{ key: 'title', kind: 'text', required: true, localized: true },
		{ key: 'summary', kind: 'text', localized: true },
		{ key: 'body', kind: 'markdown', required: true, localized: true },
		{ key: 'cover', kind: 'media' },
		{ key: 'type', kind: 'select', required: true },
		{ key: 'tags', kind: 'repeater' },
		{ key: 'pinned', kind: 'boolean' },
		{ key: 'published', kind: 'boolean' },
		{ key: 'publishedAt', kind: 'date' }
	],
	async refs(db) {
		if (!db) return [];
		const posts = await getPublishedPostSummaries(db, BASE_LOCALE);
		return posts.map((p) => ({ slug: p.slug, lastmod: p.date, locales: p.availableLocales }));
	},
	async filterIndexed(db, refs) {
		const kit = getDb(db);
		const hidden = await kit
			.select({ postId: postSeo.postId })
			.from(postSeo)
			.where(and(eq(postSeo.locale, BASE_LOCALE), eq(postSeo.robotsIndex, false)));
		const hiddenIds = new Set(hidden.map((h) => h.postId));
		return hiddenIds.size > 0 ? refs.filter((r) => !hiddenIds.has(`post:${r.slug}`)) : refs;
	}
});

registerContentType({
	key: 'pages',
	pathFor: (slug) => `/${slug}`,
	jsonLdType: 'WebPage',
	fields: [
		{ key: 'title', kind: 'text', required: true, localized: true },
		{ key: 'summary', kind: 'text', localized: true },
		{ key: 'body', kind: 'markdown', required: true, localized: true },
		{ key: 'cover', kind: 'media' },
		{ key: 'published', kind: 'boolean' }
	],
	async refs(db) {
		if (!db) return [];
		return (await getPublishedPageRefs(db)) satisfies ContentItemRef[];
	}
});

registerContentType({
	key: 'series',
	pathFor: (slug) => `/series/${slug}`,
	listPath: '/series',
	jsonLdType: 'CollectionPage',
	fields: [
		{ key: 'title', kind: 'text', required: true, localized: true },
		{ key: 'summary', kind: 'text', localized: true },
		{ key: 'cover', kind: 'media' },
		{ key: 'published', kind: 'boolean' }
	],
	async refs(db) {
		if (!db) return [];
		const list = await getSeriesIndex(db, BASE_LOCALE);
		return list.map((s) => ({ slug: s.slug }));
	}
});
