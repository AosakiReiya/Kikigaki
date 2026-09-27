import { error, json } from '@sveltejs/kit';
import { inspectUrl, testGsc } from '$lib/server/gsc';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const { url, test } = (await request.json().catch(() => ({}))) as {
		url?: string;
		test?: boolean;
	};
	if (test) return json(await testGsc(db, platform?.env.AI_SECRET));
	if (!url) error(400, 'missing url');
	const r = await inspectUrl(db, platform?.env.AI_SECRET, url);
	return json(r, { status: r.ok ? 200 : 502 });
};
