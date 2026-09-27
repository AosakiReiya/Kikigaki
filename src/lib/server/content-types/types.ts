/**
 * Phase 79a — content-type manifest contract.
 *
 * A content type is: route shape + field schema + index-level read (refs) +
 * SEO declaration. 79a consumes `refs`/`pathFor`/`filterIndexed` for
 * index surfaces (sitemap today; future listings/registry UI). `fields` and
 * `jsonLdType` are declarative in 79a and get consumed by 79b (dynamic admin
 * forms) and 79d (per-type SEO templates) respectively — DO NOT wire them to
 * behaviour yet; the detail loaders stay hand-written until proven otherwise.
 */
import type { Locale } from '$lib/paraglide/runtime';
import type { D1Database } from '@cloudflare/workers-types';

/** One indexable item as seen by generic consumers (no title needed). */
export interface ContentItemRef {
	slug: string;
	/** ISO date (YYYY-MM-DD) for sitemap lastmod; absent = unknown */
	lastmod?: string;
	/** Locales with a real translation; absent/empty = serve all locales */
	locales?: Locale[];
}

export type ContentFieldKind =
	'text' | 'markdown' | 'media' | 'repeater' | 'boolean' | 'date' | 'select';

/** Field schema consumed by the 79b dynamic form; mirrors existing columns. */
export interface ContentTypeField {
	key: string;
	kind: ContentFieldKind;
	required?: boolean;
	/** Lives in the *_translations table (form groups it under locale tabs). */
	localized?: boolean;
	/** text/markdown length cap (code points) */
	max?: number;
	/** select choices */
	options?: string[];
}

export interface ContentTypeManifest {
	/** Registry key, e.g. 'posts'. Slug-safe. */
	key: string;
	/**
	 * 'dedicated' (default) = code-defined table + hand-written loaders (posts/pages/series).
	 * 'generic' = 79b dynamic type; rows live in content_items, forms render from `fields`.
	 */
	storage?: 'dedicated' | 'generic';
	/** Feed index consumers (sitemap) — generic types stay false until 79d wires public routes. */
	sitemap?: boolean;
	/** Human label for admin surfaces (dynamic types). */
	label?: string;
	/** Detail path from a slug (sitemap loc, generic links). */
	pathFor(slug: string): string;
	/** Listing page (appears in sitemap); undefined = no index listing. */
	listPath?: string;
	/** JSON-LD @type for detail pages (declarative in 79a). */
	jsonLdType: string;
	fields: ContentTypeField[];
	/** Index-level read. No db available → empty list (never throws). */
	refs(db: D1Database | undefined): Promise<ContentItemRef[]>;
	/**
	 * noindex governance (Phase 61 SEO consistency): drop refs the site marks
	 * non-indexable in the base locale. Google forbids sitemap/index contradiction.
	 */
	filterIndexed?(db: D1Database, refs: ContentItemRef[]): Promise<ContentItemRef[]>;
}
