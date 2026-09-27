import { applySiteRuntime, site } from '$lib/site';
import { getSettings, siteRuntimeOf } from '$lib/server/settings';
import type { RequestHandler } from './$types';

/* * robots.txt (Phase 61): moved from a static file to a route; the Sitemap line follows the site.url setting */
export const GET: RequestHandler = async ({ platform }) => {
	// Sitemap line follows the site URL — site_url is a runtime value (the endpoint must apply it itself)
	const db = platform?.env.DB;
	if (db) applySiteRuntime(siteRuntimeOf(await getSettings(db)));
	const lines = [
		'# allow crawling everything by default',
		'User-agent: *',
		'Disallow: /admin',
		'Disallow: /api/',
		'',
		// after route changes the Sitemap line follows site.url (runtime value; the endpoint applies it itself)
		`Sitemap: ${site.url}/sitemap.xml`,
		''
	];
	return new Response(lines.join('\n'), {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
