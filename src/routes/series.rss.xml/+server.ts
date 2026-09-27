import { BASE_LOCALE, getSeriesIndex, publishDuePosts } from '$lib/server/content';
import { applySiteRuntime, site } from '$lib/site';
import { getSettings, siteRuntimeOf } from '$lib/server/settings';
import type { Locale } from '$lib/paraglide/runtime';
import type { RequestHandler } from './$types';

/* updated_at is theoretically NOT NULL; still guarded: invalid date = omit pubDate (optional field) */
const validDate = (v: number | null | undefined): Date | undefined => {
	if (v == null) return undefined;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? undefined : d;
};

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

/* * series (book) directory feed: subscribe to "which books exist, which are updating" */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (db) await publishDuePosts(db).catch(() => {}); // Phase 67
	if (db) applySiteRuntime(siteRuntimeOf(await getSettings(db)));
	const books = db ? await getSeriesIndex(db, BASE_LOCALE as Locale) : [];

	const items = books
		.map((s) => {
			const url = `${site.url}/series/${s.slug}`;
			return [
				'\t\t<item>',
				`\t\t\t<title>${escapeXml(s.title)}</title>`,
				`\t\t\t<link>${url}</link>`,
				`\t\t\t<guid isPermaLink="true">${url}</guid>`,
				`\t\t\t<description>${escapeXml(s.summary ? `${s.summary}（共 ${s.count} 章）` : `共 ${s.count} 章`)}</description>`,
				...(s.cover
					? [
							`\t\t\t<media:content url="${escapeXml(site.url + s.cover)}" medium="image" type="image/*" />`
						]
					: []),
				...(validDate(s.updatedAt)
					? [`\t\t\t<pubDate>${validDate(s.updatedAt)!.toUTCString()}</pubDate>`]
					: []),
				'\t\t</item>'
			].join('\n');
		})
		.join('\n');

	const newest = books.reduce((a, b) => Math.max(a, b.updatedAt ?? 0), 0);

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
	<channel>
		<title>${escapeXml(site.title)} — ${escapeXml('系列')}</title>
		<link>${site.url}/series</link>
		<description>${escapeXml('依序閱讀：把散落的文章收進同一條敘事線。')}</description>
		<language>zh-TW</language>
		<generator>Kikigaki Blog (Cloudflare Pages)</generator>
		<ttl>60</ttl>
		<lastBuildDate>${(newest ? new Date(newest) : new Date()).toUTCString()}</lastBuildDate>
		<atom:link href="${site.url}/series.rss.xml" rel="self" type="application/rss+xml" />
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
