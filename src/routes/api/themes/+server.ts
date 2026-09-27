import { error, json } from '@sveltejs/kit';
import { listThemes } from '$lib/server/themes';
import type { RequestHandler } from './$types';

/* * public read-only (78c): only the fields needed to render enabled DB themes (mount side caches compiles); same pattern as components/code */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const rows = (await listThemes(db)).filter((t) => t.enabled);
	// short shared-cache TTL: theme edits land within minutes, saves also client-invalidate
	return json(
		{
			themes: rows.map(
				({ id, label, base, version, tokensCss, surfaces, behaviors, updatedAt }) => ({
					id,
					label,
					base,
					version,
					tokensCss,
					surfaces,
					behaviors: Object.keys(behaviors).length ? behaviors : undefined,
					updatedAt
				})
			)
		},
		{ headers: { 'cache-control': 'public, max-age=30, s-maxage=300, stale-while-revalidate=600' } }
	);
};
