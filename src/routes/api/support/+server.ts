/**
 * POST /api/support {amount, message} — 79e-3 tips (no product chain).
 * surfaces not enabled returns 404; single provider returns {url} directly, multiple returns {select}.
 */
import { json } from '@sveltejs/kit';
import { getSettings } from '$lib/server/settings';
import type { CommerceEnv } from '$lib/server/commerce/types';
import { attachProvider, orderRateOk, resolveProviders, tipOrder } from '$lib/server/commerce';

import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'db_unavailable' }, { status: 500 });
	const settings = await getSettings(db);
	if (!settings.supportSurfaces) return json({ error: 'support_disabled' }, { status: 404 });
	const providers = resolveProviders(platform?.env as unknown as CommerceEnv);
	if (providers.length === 0) return json({ error: 'checkout_not_configured' }, { status: 503 });
	let body: { amount?: unknown; message?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'bad_json' }, { status: 400 });
	}
	const ip =
		request.headers.get('cf-connecting-ip') ??
		(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
	if (!(await orderRateOk(db, ip))) return json({ error: 'rate_limited' }, { status: 429 });
	const staged = await tipOrder(
		db,
		platform?.env as unknown as CommerceEnv,
		String(body.amount ?? ''),
		String(body.message ?? '').slice(0, 500),
		ip
	);
	if ('error' in staged) return json({ error: staged.error }, { status: 400 });
	const origin = (
		(platform?.env as unknown as CommerceEnv).ORIGIN ?? `${url.protocol}//${url.host}`
	).replace(/\/+$/, '');
	if (providers.length === 1) {
		const res = await attachProvider(db, providers[0], staged.orderId, origin);
		if ('error' in res) return json({ error: res.error }, { status: 400 });
		return json({ url: res.redirectUrl });
	}
	return json({ select: `/checkout/select?order=${staged.orderId}` });
};
