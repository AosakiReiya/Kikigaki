import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return;
	const { getSettings } = await import('$lib/server/settings');
	const s = await getSettings(db);
	if (
		!(s.supportSurfaces ?? '')
			.split(',')
			.map((x) => x.trim())
			.includes('support')
	)
		error(404);
	return { meta: { title: '', description: '', path: '/support' } };
};
