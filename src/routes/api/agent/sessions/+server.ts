import { error, json } from '@sveltejs/kit';
import { createSession, listSessions } from '$lib/agent/runtime/store';
import { MODES } from '$lib/agent/runtime/types';
import type { AgentMode } from '$lib/agent/runtime/types';
import type { RequestHandler } from './$types';

const noStore = { 'cache-control': 'no-store' };

export const GET: RequestHandler = async ({ platform, locals, url }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const projectParam = url.searchParams.get('project');
	const rows = await listSessions(db, locals.user!.id, projectParam ?? 'all');
	return json({ sessions: rows }, { headers: noStore });
};

export const POST: RequestHandler = async ({ platform, locals, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const mode = MODES.includes(body.mode as AgentMode) ? (body.mode as AgentMode) : 'chat';
	const modelRowId =
		typeof body.modelRowId === 'string' && body.modelRowId ? body.modelRowId : null;
	const project =
		typeof body.project === 'string' && body.project ? body.project.slice(0, 80) : null;
	const agent = typeof body.agent === 'string' && body.agent ? body.agent.slice(0, 32) : null;
	const session = await createSession(db, locals.user!.id, mode, modelRowId, project, agent);
	return json({ session }, { status: 201, headers: noStore });
};
