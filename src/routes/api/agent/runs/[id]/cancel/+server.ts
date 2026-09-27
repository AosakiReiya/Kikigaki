import { error, json } from '@sveltejs/kit';
import { cancelRun } from '$lib/agent/runtime/engine';
import { ownedRun } from '$lib/agent/runtime/api-server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ platform, locals, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const owned = await ownedRun(db, params.id, locals.user!.id);
	if (!owned) error(404, 'not_found');
	const cancelled = await cancelRun(db, owned.run.id);
	return json({ ok: true, requested: cancelled });
};
