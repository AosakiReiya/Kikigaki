import { error, json } from '@sveltejs/kit';
import { bindEmail } from '../_util';
import { testEmailConnection } from '$lib/server/email';
import type { RequestHandler } from './$types';

/* * connectivity test (sends nothing) */
export const POST: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	bindEmail(platform);
	const r = await testEmailConnection(db, platform?.env.AI_SECRET);
	return json(r, { status: r.ok ? 200 : 400 });
};
