import { error } from '@sveltejs/kit';
import { setAgentMasterKey, advanceRun, setAgentBucket } from '$lib/agent/runtime/engine';
import { updateRun } from '$lib/agent/runtime/store';
import { makeChannel, ownedRun } from '$lib/agent/runtime/api-server';
import { sseResponse } from '$lib/agent/runtime/sse';
import type { AdvanceInput } from '$lib/agent/runtime/engine';
import type { RequestHandler } from './$types';

/* * POST {decisions?, clientResults?} → continue the run and stream (SSE) */
export const POST: RequestHandler = async ({ platform, locals, params, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const owned = await ownedRun(db, params.id, locals.user!.id);
	if (!owned) error(404, 'not_found');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const decisions = Array.isArray(body.decisions)
		? (body.decisions as unknown[])
				.map((x) => x as Record<string, unknown>)
				.filter((x) => typeof x.approvalId === 'string')
				.map((x) => ({
					approvalId: String(x.approvalId),
					approve: x.approve === true,
					always: x.always === true
				}))
		: undefined;
	const clientResults = Array.isArray(body.clientResults)
		? (body.clientResults as unknown[])
				.map((x) => x as Record<string, unknown>)
				.filter((x) => typeof x.callId === 'string')
				.map((x) => ({
					callId: String(x.callId),
					ok: x.ok === true,
					result: typeof x.result === 'string' ? x.result : ''
				}))
		: undefined;
	const input: AdvanceInput = { decisions, clientResults };

	return sseResponse(async (h) => {
		const ch = makeChannel(db, owned.session.id, h);
		try {
			setAgentBucket(platform?.env.BUCKET);
			setAgentMasterKey(platform?.env.AI_SECRET);
			const adv = await advanceRun(db, platform?.env.AI_SECRET, {
				runId: owned.run.id,
				userId: locals.user!.id,
				input,
				ch
			});
			if (!adv.ok) h.send('stream.error', { error: adv.error });
			h.send('stream.close', {
				status: adv.ok ? adv.run.status : 'failed',
				runId: owned.run.id
			});
			h.close();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			await updateRun(db, owned.run.id, {
				status: 'failed',
				error: `handler_crashed: ${msg.slice(0, 200)}`,
				finishedAt: new Date()
			}).catch(() => {});
			h.send('stream.error', { error: `handler_crashed: ${msg.slice(0, 200)}` });
			h.send('stream.close', { status: 'failed', runId: owned.run.id });
			h.close();
		}
	});
};
