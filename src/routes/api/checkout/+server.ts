/**
 * POST /api/checkout {items:[{typeKey,slug}]}
 * → single provider: build the checkout directly, return {url}; multiple: stage the order, return the {select} page.
 * Prices computed from current server values; unconfigured keys return 503 (front-end UI degrades to no-shop naturally).
 */
import { json } from '@sveltejs/kit';
import type { CommerceEnv } from '$lib/server/commerce/types';
import { attachProvider, orderRateOk, resolveProviders, stageOrder } from '$lib/server/commerce';

import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, url }) => {
	const db = platform?.env.DB;
	if (!db) return json({ error: 'db_unavailable' }, { status: 500 });
	const env = platform?.env as unknown as CommerceEnv;
	const providers = resolveProviders(env);
	if (providers.length === 0) return json({ error: 'checkout_not_configured' }, { status: 503 });
	let body: { items?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'bad_json' }, { status: 400 });
	}
	const items = Array.isArray(body.items)
		? (body.items as Array<Record<string, unknown>>)
				.filter((i) => typeof i?.typeKey === 'string' && typeof i?.slug === 'string')
				.map((i) => ({
					typeKey: String(i.typeKey).slice(0, 31),
					slug: String(i.slug).slice(0, 60)
				}))
		: [];
	const ip =
		request.headers.get('cf-connecting-ip') ??
		(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
	if (!(await orderRateOk(db, ip))) return json({ error: 'rate_limited' }, { status: 429 });
	const staged = await stageOrder(db, env, items, '', ip);
	if ('error' in staged)
		return json(
			{ error: staged.error },
			{ status: staged.error === 'bad_price' || staged.error === 'not_deliverable' ? 400 : 404 }
		);
	const origin = (env.ORIGIN ?? `${url.protocol}//${url.host}`).replace(/\/+$/, '');
	if (providers.length === 1) {
		const res = await attachProvider(db, providers[0], staged.orderId, origin);
		if ('error' in res) return json({ error: res.error }, { status: 400 });
		return json({ url: res.redirectUrl });
	}
	return json({ select: `/checkout/select?order=${staged.orderId}` });
};
