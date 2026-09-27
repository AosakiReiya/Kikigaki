import { json } from '@sveltejs/kit';
import { listSelectableAgents } from '$lib/agent/runtime/agents';
import type { RequestHandler } from './$types';

const noStore = { 'cache-control': 'no-store' };

/* * selectable primary agents (for the picker) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ agents: [] }, { headers: noStore });
	return json({ agents: await listSelectableAgents(db) }, { headers: noStore });
};
