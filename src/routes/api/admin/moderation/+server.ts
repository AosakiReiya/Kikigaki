import { error, json } from '@sveltejs/kit';
import {
	getModerationConfig,
	saveModerationConfig,
	type SaveModerationInput
} from '$lib/server/moderation/config';
import type { RequestHandler } from './$types';

/* * comment moderation console (hooks already guard /api/admin) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	return json(await getModerationConfig(db));
};

export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as SaveModerationInput;
	const r = await saveModerationConfig(db, body);
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json(r.config);
};
