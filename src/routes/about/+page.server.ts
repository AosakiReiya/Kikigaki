import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { getSettings, identityFor } from '$lib/server/settings';
import { getDb } from '$lib/server/db';
import { pageViews, posts, registryItems } from '$lib/server/db/schema';
import {
	BASE_LOCALE,
	getPinnedPostSummaries,
	getPublishedPostCount,
	getPublishedPostSummaries,
	getTags
} from '$lib/server/content';
import { renderMarkdown } from '$lib/markdown';
import * as m from '$lib/paraglide/messages';
import { href } from '$lib/nav';
import { locales, type Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';
import type { ShowcaseItem } from '$lib/themes/contracts';

/**
 * About page (Phase 40 Portfolio): rendering belongs to the theme slot (themePack().About);
 * this only feeds data — about_body (may contain :::components), live stats, featured works, tags.
 * Empty about_body → the theme layer falls back to default localized copy.
 */
export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env.DB;
	const locale: Locale = locals.locale ?? BASE_LOCALE;

	if (!db) {
		return {
			aboutHtml: null,
			stats: { posts: 0, views: 0, components: 0, tags: 0, locales: locales.length },
			showcase: [] as ShowcaseItem[],
			tags: [] as { name: string; display: string; count: number }[],
			meta: { title: m.nav_about(), description: m.about_meta_desc(), path: '/about' }
		};
	}

	const kit = getDb(db);
	const [settings, pinned, recent, tagRows, postCount, [viewRow], [compRow]] = await Promise.all([
		getSettings(db),
		getPinnedPostSummaries(db, locale),
		getPublishedPostSummaries(db, locale, { limit: 6 }),
		getTags(db, locale),
		getPublishedPostCount(db),
		kit.select({ c: sql<number>`count(*)` }).from(pageViews),
		kit
			.select({ c: count() })
			.from(registryItems)
			.where(
				and(
					eq(registryItems.kind, 'component'),
					eq(registryItems.review, 'approved'),
					eq(registryItems.enabled, true)
				)
			)
	]);

	const ident = identityFor(settings, locale);
	const aboutBody = ident.aboutBody.trim();
	const aboutHtml = aboutBody ? renderMarkdown(aboutBody).html : null;

	// featured works (Phase 41/42.5): config is the star; padding to 6 cards is an admin toggle
	// Phase 53: href points at an on-site post and the work has no cover → inherit that post's cover
	const workPostSlugs = new Set(
		ident.works
			.map((w) => w.href.match(/^\/blog\/([^/?#]+)/)?.[1])
			.filter((x): x is string => Boolean(x))
	);
	const linkedCovers = workPostSlugs.size
		? await kit
				.select({ slug: posts.slug, cover: posts.cover })
				.from(posts)
				.where(inArray(posts.slug, [...workPostSlugs]))
		: [];
	const coverBySlug = new Map(linkedCovers.map((r) => [r.slug, r.cover ?? undefined]));
	const workItems: ShowcaseItem[] = ident.works.map((w) => {
		const linkedSlug = w.href.match(/^\/blog\/([^/?#]+)/)?.[1];
		return {
			kind: 'work',
			slug: w.href.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 48) || 'work',
			title: w.title,
			description: w.description ?? '',
			href: w.href,
			badge: w.badge || 'work',
			date: w.date,
			cover: w.cover ?? (linkedSlug ? coverBySlug.get(linkedSlug) : undefined)
		};
	});
	const seen = new Set<string>();
	workItems.forEach((w) => seen.add(w.slug));
	const backfill: ShowcaseItem[] = [...pinned, ...recent]
		.filter((p) =>
			workPostSlugs.has(p.slug) || seen.has(p.slug) ? false : (seen.add(p.slug), true)
		)
		.map((p) => ({
			kind: 'post' as const,
			slug: p.slug,
			title: p.title,
			description: p.summary,
			href: href(`/blog/${p.slug}`),
			badge: p.pinned ? m.about_badge_pinned() : m.about_badge_post(),
			date: p.date,
			cover: p.cover
		}));
	const showcase: ShowcaseItem[] = (
		workItems.length > 0 && !settings.worksBackfill ? workItems : [...workItems, ...backfill]
	).slice(0, 6);

	return {
		aboutHtml,
		stats: {
			posts: postCount,
			views: Number(viewRow?.c ?? 0),
			components: Number(compRow?.c ?? 0),
			tags: tagRows.length,
			locales: locales.length
		},
		showcase,
		tags: tagRows,
		meta: { title: m.nav_about(), description: m.about_meta_desc(), path: '/about' }
	};
};
