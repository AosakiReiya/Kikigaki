import { and, eq, inArray } from 'drizzle-orm';
import { renderMarkdown } from '$lib/markdown';
import { publishDuePosts, BASE_LOCALE, getPublishedPostSummaries } from '$lib/server/content';

import { getSettings, siteRuntimeOf } from '$lib/server/settings';
import { customComponentNames } from '$lib/server/components';
import { getDb } from '$lib/server/db';
import { postTranslations, posts } from '$lib/server/db/schema';
import { applySiteRuntime, site } from '$lib/site';
import type { Locale } from '$lib/paraglide/runtime';
import type { RequestHandler } from './$types';

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

/* * ]]> inside CDATA must be split (standard XML practice) */
function cdata(value: string): string {
	return `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

/* * full-text entry cap: feed size and render cost control (old posts rely on archive pages, not the full feed) */
const FEED_LIMIT = 30;

/* nullable published_at is a legal state (published posts without a set publish date):
   omit pubDate/dc:date when the date is invalid (both optional in RSS 2.0) — never fabricate timestamps */
const validDate = (v: string | null | undefined): Date | undefined => {
	if (!v) return undefined;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? undefined : d;
};

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (db) await publishDuePosts(db).catch(() => {}); // Phase 67: RSS must reflect due schedules too
	if (db) applySiteRuntime(siteRuntimeOf(await getSettings(db)));
	// RSS stays a single base-language feed (subscribers are core readers; multilingual feeds later)
	const posts_ = db
		? await getPublishedPostSummaries(db, BASE_LOCALE as Locale, { limit: FEED_LIMIT })
		: [];

	// base-language bodies fetched in one go (single query) + custom component names → same render pipeline as post pages
	let bodies = new Map<string, string>();
	let names = new Set<string>();
	if (db && posts_.length > 0) {
		const kit = getDb(db);
		const [rows, n] = await Promise.all([
			kit
				.select({ postId: postTranslations.postId, body: postTranslations.body })
				.from(postTranslations)
				.innerJoin(posts, eq(posts.id, postTranslations.postId))
				.where(
					and(
						eq(postTranslations.locale, BASE_LOCALE),
						inArray(
							posts.slug,
							posts_.map((p) => p.slug)
						)
					)
				),
			customComponentNames(db)
		]);
		bodies = new Map(rows.map((r) => [r.postId.replace(/^post:/, ''), r.body]));
		names = n;
	}

	const items = posts_
		.map((post) => {
			const url = `${site.url}/blog/${post.slug}`;
			const html = bodies.has(post.slug) ? renderMarkdown(bodies.get(post.slug)!, names).html : '';
			return [
				'\t\t<item>',
				`\t\t\t<title>${escapeXml(post.title)}</title>`,
				`\t\t\t<link>${url}</link>`,
				`\t\t\t<guid isPermaLink="true">${url}</guid>`,
				`\t\t\t<description>${escapeXml(post.summary)}</description>`,
				...(html ? [`\t\t\t<content:encoded>${cdata(html)}</content:encoded>`] : []),
				...(post.cover
					? [
							`\t\t\t<media:content url="${escapeXml(site.url + post.cover)}" medium="image" type="image/*" />`
						]
					: []),
				...(validDate(post.date)
					? [
							`\t\t\t<dc:date>${validDate(post.date)!.toISOString()}</dc:date>`,
							`\t\t\t<pubDate>${validDate(post.date)!.toUTCString()}</pubDate>`
						]
					: []),
				...post.tags.map((tag) => `\t\t\t<category>${escapeXml(tag.name)}</category>`),
				'\t\t</item>'
			].join('\n');
		})
		.join('\n');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
	xmlns:atom="http://www.w3.org/2005/Atom"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:media="http://search.yahoo.com/mrss/"
	xmlns:dc="http://purl.org/dc/elements/1.1/">
	<channel>
		<title>${escapeXml(site.title)}</title>
		<link>${site.url}</link>
		<description>${escapeXml(site.description)}</description>
		<language>zh-TW</language>
		<generator>Kikigaki Blog (Cloudflare Pages)</generator>
		<ttl>60</ttl>
		<lastBuildDate>${(validDate(posts_[0]?.date) ?? new Date()).toUTCString()}</lastBuildDate>
		<atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml" />
${items}
	</channel>
</rss>
`;

	return new Response(xml, {
		headers: {
			'content-type': 'application/rss+xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
