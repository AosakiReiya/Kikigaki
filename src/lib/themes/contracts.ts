/**
 * Theme slot contracts (Phase 20.5) — Theme = tokens (CSS) + behavior (animation) + layout packs (structure).
 *
 * A pack provides the structural components for the public site's 5 screens; routes shrink to a thin data-adaptation layer:
 *   load untouched → +page.svelte is just `<svelte:component this={pack.Home} {...props}/>`.
 * SEO (JSON-LD / head) stays in routes (theme-agnostic); visible structure belongs to themes.
 *
 * The content contract is guarded by the shared atom `PostBody` (prose + `.cc` placeholders + use:hydrateComponents);
 * every pack must render post bodies through it → reskinning never breaks the component system (consistent across themes).
 */
import type { Component } from 'svelte';
import type {
	BookMeta,
	BookRef,
	CategoryCount,
	Post,
	PostSummary,
	SeriesCard,
	TagRef,
	YearStat
} from '$lib/server/content';

import type { SearchResult } from '$lib/server/search';
import type { PageViewModel } from '$lib/server/pages';
import type { BlogFilterState } from '$lib/blog-params';

export interface TagCount {
	name: string;
	display: string;
	count: number;
}

/** header/footer are self-sufficient (read page.data) → slot contract = no props */
export type HeaderProps = Record<string, never>;
export type FooterProps = Record<string, never>;

/** home = latest-posts showcase entry (LIMIT N, no pagination; full browsing lives at /blog) */
export interface HomeProps {
	posts: PostSummary[];
	pinned: PostSummary[];
	tags: TagCount[];
}

/** /blog content exploration page (Phase 50): all posts × search × tags × years × sort × pagination */
export interface BlogProps {
	posts: PostSummary[];
	total: number;
	page: number;
	totalPages: number;
	tags: TagCount[];
	years: YearStat[];
	/** dynamic categories (slug + locale display name + published post count, sorted by sort) */
	categories: CategoryCount[];
	/** published series (sidebar "Series" group; includes series-only member counts = book context) */
	series: SeriesCard[];
	filter: BlogFilterState;
	/** embedded full-text query ('' = inactive) */
	query: string;
}

export interface PostProps {
	post: Post;
	adjacent: { prev?: PostSummary; next?: PostSummary };
	/** parent-book fine print (Phase 58.2: the book is the reading body; post pages keep only the entry) */
	seriesBooks?: BookRef[];
	/** prev/next link prefix (inside a book shell = /series/<book>; default /blog) */
	basePath?: string;
	/** in-book-shell layout: drop the column max-width and side padding (the shell decides width) */
	flush?: boolean;
	/** hide the in-body right TOC and TocFab (the book shell collects chapter TOCs into the left TOC) */
	hideToc?: boolean;
}

export interface ArchiveProps {
	tag: string;
	display: string;
	posts: PostSummary[];
	total: number;
	page: number;
	totalPages: number;
}

/** site-wide search results page (Phase 51): FTS5-ranked hits + highlighting */
export interface SearchProps {
	query: string;
	results: SearchResult[];
	total: number;
	page: number;
	totalPages: number;
}

/** custom pages (Phase 20.6): no TOC / no tags, whole-page PostBody render */
export interface PageProps {
	page: PageViewModel;
}

/** featured work cards (pinned posts + approved components in one view) */
export interface ShowcaseItem {
	kind: 'post' | 'component' | 'work';
	slug: string;
	title: string;
	description: string;
	href: string;
	badge?: string;
	/** publish date (ISO; shown as year.month on cards) */
	date?: string;
	/** cover image (missing = card face uses the icon fallback band) */
	cover?: string;
}

/** Portfolio about page (Phase 40): author identity + live site stats + featured works; skeleton shared across themes */
export interface AboutProps {
	aboutHtml: string | null;
	stats: { posts: number; views: number; components: number; tags: number; locales: number };
	showcase: ShowcaseItem[];
	tags: TagCount[];
}

/** /series index (card wall) */
export interface SeriesIndexProps {
	series: SeriesCard[];
	page: number;
	totalPages: number;
}

/** /series/[slug] single-series view */
export interface SeriesProps {
	book: BookMeta;
	chapters: PostSummary[];
	current?: Post;
	adjacent?: { prev?: PostSummary; next?: PostSummary };
}

/** slot allowlist (78c: DB-theme validation; order = ThemePack keys) */
export const THEME_SURFACES = [
	'Header',
	'Footer',
	'Home',
	'Blog',
	'Search',
	'Post',
	'Archive',
	'Page',
	'About',
	'SeriesIndex',
	'Series'
] as const;
export type ThemeSurface = (typeof THEME_SURFACES)[number];

/* ------------------------------------------------------------------ */
/* 78f (B1) — theme context routes: a theme owns the "site shape", not just the look.            */
/* packs declare routes (bare path → own surface); content lives in theme_content        */
/* (owner-filled JSON in DB); abstract declares none = behavior bit-identical to status quo.          */
/* ------------------------------------------------------------------ */

export interface ThemeRouteDef {
	/** single-segment root path (no slashes), e.g. 'services'; pack-owned, reserved as the cross-theme union */
	path: string;
	/** render slot: key of extra ('Page' can also override pages) */
	surface: string;
}

/** surface props for context-route pages: owner content (theme_content.pages[slug]) + site settings */
export interface ThemeRouteProps {
	slug: string;
	/** theme_content.pages[slug] (owner may fill title/blocks/...); unfilled = undefined */
	content: Record<string, unknown> | undefined;
	themeContent: Record<string, unknown>;
}

export interface ThemePack {
	Header: Component<HeaderProps>;
	Footer: Component<FooterProps>;
	Home: Component<HomeProps>;
	Blog: Component<BlogProps>;
	Search: Component<SearchProps>;
	Post: Component<PostProps>;
	Archive: Component<ArchiveProps>;
	Page: Component<PageProps>;
	About: Component<AboutProps>;
	SeriesIndex: Component<SeriesIndexProps>;
	Series: Component<SeriesProps>;
	/** theme custom content surfaces (services/contact/press…), indexed by the routes' surface key */
	extra?: Record<string, Component<ThemeRouteProps>>;
	/** theme context-route table (B1); on a hit the /{slug} loader takes over and nav may be replaced */
	routes?: ThemeRouteDef[];
	/** 79d: list/detail override surfaces for dynamic content types (absent = neutral default components) */
	ItemList?: Component<GenericListProps>;
	ItemDetail?: Component<GenericItemProps>;
}

/** 79d dynamic-content surface props (generic content_items entries) */
export interface GenericListProps {
	typeKey: string;
	label: string;
	titleField: string;
	items: import('$lib/server/content-items').ContentItemRow[];
}
export interface GenericItemProps {
	typeKey: string;
	typeLabel: string;
	titleField: string;
	fields: import('$lib/server/content-types/types').ContentTypeField[];
	item: import('$lib/server/content-items').ContentItemRow;
	html: Record<string, string>;
	/** 79e: injected by the route when the products contract fields are complete (present = render BuyBar) */
	buy?: { price: string } | null;
}

export type { Post, PostSummary, TagRef, PageViewModel };
