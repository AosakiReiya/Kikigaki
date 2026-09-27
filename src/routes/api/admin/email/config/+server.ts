import { error, json } from '@sveltejs/kit';
import { bindEmail } from '../_util';
import { getEmailConfig, saveEmailConfig, type EmailConfigInput } from '$lib/server/email';
import type { RequestHandler } from './$types';

/* * Email provider config read/write (hooks already guard /api/admin; credentials go in but never out — last four returned) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	bindEmail(platform);
	return json(await getEmailConfig(db));
};

export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	bindEmail(platform);
	const body = (await request.json().catch(() => ({}))) as EmailConfigInput;
	const r = await saveEmailConfig(db, platform?.env.AI_SECRET, body);
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json(await getEmailConfig(db));
};
