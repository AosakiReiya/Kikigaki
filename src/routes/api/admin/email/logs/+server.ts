import { error, json } from '@sveltejs/kit';
import { listEmailLogs } from '$lib/server/email';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, url }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
	return json({ logs: await listEmailLogs(db, limit) });
};
