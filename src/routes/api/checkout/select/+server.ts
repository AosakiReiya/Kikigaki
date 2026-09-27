/**
 * POST /api/checkout/select {orderId, provider}
 * → attach a staged order to the chosen provider's checkout (returns {url}). An order attaches only once.
 */
import { json } from '@sveltejs/kit';
import type { CommerceEnv } from '$lib/server/commerce/types';
import { attachProvider, resolveProviders } from '$lib/server/commerce';

import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'db_unavailable' }, { status: 500 });
	const env = platform?.env as unknown as CommerceEnv;
	let body: { orderId?: unknown; provider?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'bad_json' }, { status: 400 });
	}
	const orderId = String(body.orderId ?? '').slice(0, 40);
	if (!/^[0-9a-f-]{36}$/.test(orderId)) return json({ error: 'bad_order' }, { status: 400 });
	const name = String(body.provider ?? '').slice(0, 16);
	const provider = resolveProviders(env).find((p) => p.name === name);
	if (!provider) return json({ error: 'unknown_provider' }, { status: 404 });
	const origin = (env.ORIGIN ?? `${url.protocol}//${url.host}`).replace(/\/+$/, '');
	const res = await attachProvider(db, provider, orderId, origin);
	if ('error' in res)
		return json({ error: res.error }, { status: res.error === 'no_such_order' ? 404 : 400 });
	return json({ url: res.redirectUrl });
};
