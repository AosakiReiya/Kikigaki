import { and, eq } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import { ownedSession } from '$lib/agent/runtime/api-server';
import { getDb } from '$lib/server/db';
import { agentRuns, agentToolCalls } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/* * full tool-call details (Phase 38): on expand, lazily fetch args + the complete result (events carry only previews) */
export const GET: RequestHandler = async ({ platform, locals, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSession(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	const kit = getDb(db);
	const [row] = await kit
		.select({
			name: agentToolCalls.name,
			args: agentToolCalls.args,
			result: agentToolCalls.result,
			status: agentToolCalls.status
		})
		.from(agentToolCalls)
		.innerJoin(agentRuns, eq(agentToolCalls.runId, agentRuns.id))
		.where(and(eq(agentToolCalls.id, params.callId), eq(agentRuns.sessionId, session.id)))
		.limit(1);
	if (!row) error(404, 'not_found');
	const args: unknown = (() => {
		try {
			return JSON.parse(row.args);
		} catch {
			return row.args;
		}
	})();
	return json({
		callId: params.callId,
		name: row.name,
		status: row.status,
		args,
		result: row.result
	});
};
