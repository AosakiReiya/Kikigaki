import { error, json } from '@sveltejs/kit';
import { getGscStatus, saveGscConfig } from '$lib/server/gsc';
import type { RequestHandler } from './$types';

/* * GSC config read/write (hooks already guard the /api/admin session; keys go in but never out) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	return json(await getGscStatus(db));
};

export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as {
		property?: string;
		saJson?: string;
		clear?: boolean;
	};
	const r = await saveGscConfig(db, platform?.env.AI_SECRET, body);
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json(await getGscStatus(db));
};
