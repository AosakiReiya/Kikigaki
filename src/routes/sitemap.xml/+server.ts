import { applySiteRuntime } from '$lib/site';
import { getSettings, siteRuntimeOf } from '$lib/server/settings';
import { localizeHref, locales } from '$lib/paraglide/runtime';
import type { Locale } from '$lib/paraglide/runtime';
import { BASE_LOCALE, publishDuePosts, getTags } from '$lib/server/content';
import { listContentTypes } from '$lib/server/content-types';
import { loadDynamicManifests } from '$lib/server/content-types/dynamic';
import { HREFLANG } from '$lib/i18n';
import { site } from '$lib/site';
import type { RequestHandler } from './$types';

interface SitemapEntry {
	/* * unlocalized (canonical) path */
	path: string;
	lastmod?: string;
	/* * restricted index locales (posts follow actual translations); unset = all locales */
	locales?: Locale[];
}

function esc(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	let surf = '';
	if (db) {
		const settings = await getSettings(db);
		applySiteRuntime(siteRuntimeOf(settings)); // canonical site URL is a runtime value
		surf = settings.supportSurfaces ?? '';
	}
	if (db) await publishDuePosts(db).catch(() => {}); // Phase 67

	// Phase 79a: the index section is driven by the content-type registry (refs + noindex governance
	// lives in each manifest; output order stays byte-identical to history = registration order)
	const byType = new Map<string, SitemapEntry[]>();
	for (const t of listContentTypes()) {
		let refs = await t.refs(db);
		if (db && t.filterIndexed && refs.length > 0) refs = await t.filterIndexed(db, refs);
		byType.set(
			t.key,
			refs.map((r) => ({ path: t.pathFor(r.slug), lastmod: r.lastmod, locales: r.locales }))
		);
	}
	const tags = db ? await getTags(db, BASE_LOCALE) : [];

	const generics = await loadDynamicManifests(db);
	const genericEntries: SitemapEntry[] = [];
	for (const g of generics) {
		if (g.sitemap === false) continue;
		if (g.listPath) genericEntries.push({ path: g.listPath });
		for (const r of await g.refs(db)) genericEntries.push({ path: g.pathFor(r.slug) });
	}

	const entries: SitemapEntry[] = [
		{ path: '/' },
		...listContentTypes()
			.filter((t) => t.listPath)
			.map((t) => ({ path: t.listPath as string })),
		{ path: '/about' },
		...(surf.split(',').includes('support') ? [{ path: '/support' }] : []),
		...(byType.get('posts') ?? []),
		...(byType.get('pages') ?? []),
		...tags.map((tag) => ({ path: `/blog?tag=${encodeURIComponent(tag.name)}` })),
		...(byType.get('series') ?? []),
		...genericEntries
	];

	const urls: string[] = [];
	for (const entry of entries) {
		const active = entry.locales?.length ? entry.locales : [...locales];
		const alternatives = active
			.map(
				(loc) =>
					`\t\t<xhtml:link rel="alternate" hreflang="${HREFLANG[loc]}" href="${esc(site.url + localizeHref(entry.path, { locale: loc }))}" />`
			)
			.join('\n');
		const xDefault = `\t\t<xhtml:link rel="alternate" hreflang="x-default" href="${esc(site.url + localizeHref(entry.path, { locale: 'zh-tw' }))}" />`;
		for (const loc of active) {
			const lastmod = entry.lastmod ? `\n\t\t<lastmod>${entry.lastmod}</lastmod>` : '';
			urls.push(
				`\t<url>\n\t\t<loc>${esc(site.url + localizeHref(entry.path, { locale: loc }))}</loc>\n${alternatives}\n${xDefault}${lastmod}\n\t</url>`
			);
		}
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;

	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
