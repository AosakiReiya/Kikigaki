import { error, json } from '@sveltejs/kit';
import {
	deleteSession,
	getActivePlan,
	listRuns,
	ownedSessionGuard,
	pendingApprovalsOfRun,
	renameSession,
	setSessionAttrs
} from './guards';
import { MODES } from '$lib/agent/runtime/types';
import type { AgentMode } from '$lib/agent/runtime/types';
import type { RequestHandler } from './$types';

const noStore = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async ({ platform, locals, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSessionGuard(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	const runs = await listRuns(db, session.id);
	const active = runs.find((r) => !['completed', 'failed', 'cancelled'].includes(r.status)) ?? null;
	const approvals = active ? await pendingApprovalsOfRun(db, active.id) : [];
	const plan = active ? await getActivePlan(db, active.id) : null;
	return json(
		{
			session,
			runs,
			activeRun: active,
			plan,
			pendingApprovals: approvals.map((a) => ({
				approvalId: a.approval.id,
				callId: a.call.id,
				name: a.call.name,
				summary: a.call.summary,
				risk: a.call.risk,
				args: a.call.args
			}))
		},
		{ headers: noStore }
	);
};

export const PATCH: RequestHandler = async ({ platform, locals, params, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSessionGuard(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	if (typeof body.title === 'string') {
		const title = body.title.trim().slice(0, 120);
		if (!title) error(400, 'title_required');
		await renameSession(db, session.id, title);
	}
	const patch: { mode?: AgentMode; modelRowId?: string | null; agent?: string | null } = {};
	if (body.mode !== undefined) {
		if (!MODES.includes(body.mode as AgentMode)) error(400, 'mode_invalid');
		patch.mode = body.mode as AgentMode;
	}
	if (body.modelRowId !== undefined) {
		patch.modelRowId =
			typeof body.modelRowId === 'string' && body.modelRowId ? body.modelRowId : null;
	}
	if (body.agent !== undefined)
		patch.agent = typeof body.agent === 'string' && body.agent ? body.agent.slice(0, 32) : null;
	if (Object.keys(patch).length) await setSessionAttrs(db, session.id, patch);
	const fresh = await ownedSessionGuard(db, session.id, locals.user!.id);
	return json({ ok: true, session: fresh }, { headers: noStore });
};

export const DELETE: RequestHandler = async ({ platform, locals, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSessionGuard(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	await deleteSession(db, session.id);
	return json({ ok: true }, { headers: noStore });
};
