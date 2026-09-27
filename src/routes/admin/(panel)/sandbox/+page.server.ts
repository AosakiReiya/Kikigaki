import { applyFilter } from '$lib/plugins';
import { BASE_LOCALE } from '$lib/server/content';
import type { PageServerLoad } from './$types';

/* * the sandbox's :::post demo needs a post list (79a-slim: only this page fetches it; the site layout no longer carries it) */
export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { searchIndex: [] };
	return { searchIndex: await applyFilter('search:index', [], { db, locale: BASE_LOCALE }) };
};
