import { error } from '@sveltejs/kit';
import { setAgentMasterKey, startRun, advanceRun, setAgentBucket } from '$lib/agent/runtime/engine';
import { makeChannel, ownedSession, userQuotedOk } from '$lib/agent/runtime/api-server';
import { sseResponse } from '$lib/agent/runtime/sse';
import { updateRun } from '$lib/agent/runtime/store';
import type { AgentContext } from '$lib/agent/runtime/types';
import type { RequestHandler } from './$types';

/* * POST {input, context?} → start a run and stream synchronously to the first boundary (SSE) */
export const POST: RequestHandler = async ({ platform, locals, params, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSession(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const input = typeof body.input === 'string' ? body.input.trim() : '';
	if (!input) error(400, 'input_required');
	if (input.length > 20_000) error(400, 'input_too_long');
	if (!(await userQuotedOk(db, locals.user!.id))) {
		error(429, 'concurrent run quota exceeded');
	}
	const context = (
		body.context && typeof body.context === 'object' ? body.context : {}
	) as AgentContext;

	return sseResponse(async (h) => {
		const ch = makeChannel(db, session.id, h);
		let runId = '';
		try {
			setAgentBucket(platform?.env.BUCKET);
			setAgentMasterKey(platform?.env.AI_SECRET);
			const started = await startRun(db, { session, userId: locals.user!.id, input, context }, ch);
			if (!started.ok) {
				h.send('stream.error', { error: started.error });
				h.close();
				return;
			}
			runId = started.runId;
			setAgentBucket(platform?.env.BUCKET);
			setAgentMasterKey(platform?.env.AI_SECRET);
			const adv = await advanceRun(db, platform?.env.AI_SECRET, {
				runId: started.runId,
				userId: locals.user!.id,
				input: {},
				ch
			});
			if (!adv.ok) h.send('stream.error', { error: adv.error });
			h.send('stream.close', { status: adv.ok ? adv.run.status : 'failed', runId: started.runId });
			h.close();
		} catch (e) {
			// H2: any uncaught throw must leave a terminal state — runs must never stay stuck running
			const msg = e instanceof Error ? e.message : String(e);
			if (runId)
				await updateRun(db, runId, {
					status: 'failed',
					error: `handler_crashed: ${msg.slice(0, 200)}`,
					finishedAt: new Date()
				}).catch(() => {});
			h.send('stream.error', { error: `handler_crashed: ${msg.slice(0, 200)}` });
			h.send('stream.close', { status: 'failed', runId });
			h.close();
		}
	});
};
