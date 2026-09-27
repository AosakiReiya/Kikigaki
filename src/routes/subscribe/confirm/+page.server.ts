import { confirmSubscription } from '$lib/server/subscribers';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const db = platform?.env.DB;
	if (!db) return { ok: false, error: 'no_db' };
	const t = url.searchParams.get('t') ?? '';
	if (!t) return { ok: false, error: 'no_token' };
	const r = await confirmSubscription(db, t);
	return { ok: r.ok, error: r.error ?? null, email: r.email ?? null };
};
