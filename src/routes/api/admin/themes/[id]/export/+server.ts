import { error } from '@sveltejs/kit';
import { getTheme } from '$lib/server/themes';
import { packThemeZip } from '$lib/themes/archive';
import type { RequestHandler } from './$types';

/* * 78d: theme export (kikigaki-theme/1 zip); auth via /api/admin (hooks) */
export const GET: RequestHandler = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const t = await getTheme(db, params.id);
	if (!t) error(404, 'theme_not_found');
	const zip = packThemeZip({
		slug: t.id.slice(3),
		label: t.label,
		description: t.description,
		base: t.base,
		tokensCss: t.tokensCss,
		surfaces: t.surfaces,
		behaviors: t.behaviors
	});
	return new Response(zip as unknown as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${t.id.slice(3)}.kikigaki-theme.zip"`
		}
	});
};
