import { error, json } from '@sveltejs/kit';
import { getComponentCode } from '$lib/server/components';
import type { RequestHandler } from './$types';

/* * public read-only: returns only enabled custom components' source (mount side caches/compiles itself) */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const name = url.searchParams.get('name') ?? '';
	if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) error(400, 'invalid name');
	const code = await getComponentCode(db, name);
	if (code === null) error(404, 'not found');
	return json({ name, code });
};
