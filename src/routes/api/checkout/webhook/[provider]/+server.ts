/**
 * POST /api/checkout/webhook/[provider] — per-vendor verification → settlement events only → idempotent delivery issuance.
 * Verification details all live inside provider implementations (stripe HMAC / paypal verify endpoint / airwallex HMAC / mock double-gate).
 * Disabled providers return 404 (not a misleading 503 suggesting missing config).
 */
import type { CommerceEnv } from '$lib/server/commerce/types';
import { markPaid, markRefunded, resolveProviders } from '$lib/server/commerce';

import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request, platform, params }) => {
	const db = platform?.env.DB;
	if (!db) return new Response('db', { status: 500 });
	const env = platform?.env as unknown as CommerceEnv;
	const provider = resolveProviders(env).find((p) => p.name === params.provider);
	if (!provider) return new Response('not_configured', { status: 504 });
	const raw = await request.text();
	const outcome = await provider.verifyWebhook(raw, request.headers);
	if (!outcome) return new Response('signature', { status: 400 });
	if (!outcome.handled) return new Response('ok', { status: 200 }); // ping and other noise
	if (!outcome.sessionRef) return new Response('no_ref', { status: 400 });
	if (outcome.event === 'refunded') {
		const r = await markRefunded(db, outcome.sessionRef);
		return new Response(r.ok ? 'refunded' : (r.error ?? 'fail'), { status: r.ok ? 200 : 410 });
	}
	const res = await markPaid(db, outcome.sessionRef, outcome.email ?? '', outcome.providerRef, {
		masterKey: (platform?.env as unknown as { AI_SECRET?: string })?.AI_SECRET
	});
	return new Response(res.ok ? 'paid' : (res.error ?? 'fail'), { status: res.ok ? 200 : 410 });
};
