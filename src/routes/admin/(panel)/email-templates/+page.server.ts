import { error } from '@sveltejs/kit';
import { ensureDefaultTemplates, listTemplates } from '$lib/server/email-templates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	await ensureDefaultTemplates(db);
	return { templates: await listTemplates(db) };
};
