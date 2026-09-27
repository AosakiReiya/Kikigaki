import { error, json } from '@sveltejs/kit';
import { compactSession } from '$lib/agent/runtime/compact';
import { ownedSession } from '$lib/agent/runtime/api-server';
import { appendEvent } from '$lib/agent/runtime/store';
import type { RequestHandler } from './$types';

/* * POST {} → manual compaction (keeps the latest 8) */
export const POST: RequestHandler = async ({ platform, locals, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSession(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	const r = await compactSession(db, platform?.env.AI_SECRET, session.id, 8, false);
	if (!r) return json({ ok: true, summarized: 0, kept: 0, note: '對話尚短，無需壓縮' });
	await appendEvent(db, {
		sessionId: session.id,
		type: 'context.compacted',
		payload: { summarized: r.summarized, kept: r.kept, auto: false }
	});
	return json({ ok: true, ...r });
};
