import { json } from '@sveltejs/kit';
import { customComponentNameList } from '$lib/server/components';
import type { RequestHandler } from './$types';

/* * public read-only: enabled custom component name list (for the inserter panel's live refresh) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ names: [] });
	return json({ names: await customComponentNameList(db) });
};
