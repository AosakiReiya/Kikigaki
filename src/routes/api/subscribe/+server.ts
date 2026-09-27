import { json } from '@sveltejs/kit';
import { subscribe } from '$lib/server/subscribers';
import type { RequestHandler } from './$types';

/* * POST {email,name?,source?} — double opt-in subscribe (sends the confirmation email) */
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ ok: false, error: 'no_db' }, { status: 500 });
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		name?: unknown;
		source?: unknown;
	};
	const email = typeof body.email === 'string' ? body.email : '';
	const r = await subscribe(db, platform.env.AI_SECRET, {
		email,
		name: typeof body.name === 'string' ? body.name : undefined,
		source: typeof body.source === 'string' ? body.source.slice(0, 40) : 'api'
	});
	return json(r, { status: r.ok ? 200 : 400 });
};
