import { error } from '@sveltejs/kit';
import { listEmailLogs } from '$lib/server/email';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	return { logs: await listEmailLogs(db, 100) };
};
