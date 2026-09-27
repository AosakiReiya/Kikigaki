/**
 * Airwallex — Hosted Payment (plain fetch, zero SDK).
 * Flow: create payment intent (merchant_order_id = our orderId) → return the hosted url →
 * after the buyer finishes, webhook payment_intent.succeeded (HMAC verify = official scheme:
 * signature = base64(HMAC-SHA256(secret, `${x-timestamp}.${rawBody}`)), 5-minute window);
 * the thanks page polls intent status as fallback.
 * env: AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY / AIRWALLEX_WEBHOOK_SECRET;
 * AIRWALLEX_ENV unset = demo endpoint ('prod' for production).
 */
import type { CheckoutProvider, CheckoutSession, WebhookOutcome } from './types';
import { moneyString } from './types';

const DEMO = 'https://api-demo.airwallex.com';
const PROD = 'https://api.airwallex.com';
const TOLERANCE_SEC = 5 * 60;

/** the webhook event body's name field (payment_intent.succeeded etc.) */
async function hmacB64(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	let bin = '';
	for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
	return btoa(bin);
}

export function createAirwallexProvider(
	clientId: string,
	apiKey: string,
	webhookSecret: string,
	prod: boolean
): CheckoutProvider {
	const base = prod ? PROD : DEMO;
	let tokenCache: { t: string; exp: number } = { t: '', exp: 0 };

	async function token(): Promise<string> {
		if (tokenCache.t && Date.now() < tokenCache.exp) return tokenCache.t;
		const r = await fetch(
			`${base}/api/v1/authentication/refresh?client_id=${encodeURIComponent(clientId)}&request_id=${crypto.randomUUID()}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
			}
		);
		if (!r.ok) throw new Error(`airwallex_token_${r.status}`);
		const j = (await r.json()) as { token?: string; expires_at?: number };
		tokenCache = { t: String(j.token ?? ''), exp: Date.now() + 120_000 };
		return tokenCache.t;
	}

	async function api(
		path: string,
		body: Record<string, unknown>
	): Promise<{ status: number; json: Record<string, unknown> }> {
		const t = await token();
		const r = await fetch(base + path, {
			method: 'POST',
			headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
		return { status: r.status, json };
	}

	async function intentStatus(id: string): Promise<string> {
		const { status, json } = await api('/api/v1/payment_intents/get', { id });
		if (status !== 200) return '';
		return String(json.status ?? '');
	}

	return {
		name: 'airwallex',
		async createSession(order, lines, origin) {
			const total = lines.reduce((a, l) => a + l.priceCents, 0);
			const { status, json } = await api('/api/v1/payment_intents/create', {
				amount: Number(moneyString(total, order.currency)),
				currency: order.currency.toUpperCase(),
				merchant_order_id: order.id,
				product_name: lines[0]?.title.slice(0, 255) ?? 'Kikigaki',
				return_url: `${origin}/checkout/thanks?order=${order.id}&f=1`
			});
			if (status !== 200) throw new Error(`airwallex_intent_${status}`);
			const ref = String(json.id ?? '');
			const url = String(json.url ?? '');
			if (!ref || !url) throw new Error('airwallex_intent_shape');
			return {
				orderId: order.id,
				provider: 'airwallex',
				sessionRef: ref,
				redirectUrl: url
			} satisfies CheckoutSession;
		},
		async verifyWebhook(rawBody, headers) {
			const ts = headers.get('x-timestamp');
			const sig = headers.get('x-signature');
			if (!ts || !sig || !webhookSecret) return null;
			if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SEC) return null;
			let expect: string;
			try {
				expect = await hmacB64(webhookSecret, `${ts}.${rawBody}`);
			} catch {
				return null;
			}
			if (expect.length !== sig.length) return null;
			let diff = 0;
			for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
			if (diff !== 0) return null;
			let ev: { name?: string; data?: { object?: { id?: string; merchant_order_id?: string } } };
			try {
				ev = JSON.parse(rawBody);
			} catch {
				return null;
			}
			if (String(ev.name ?? '') !== 'payment_intent.succeeded') return { handled: false };
			return {
				handled: true,
				sessionRef: String(ev.data?.object?.id ?? ''),
				email: ''
			} satisfies WebhookOutcome;
		},
		async sessionStatus(_db, sessionRef) {
			const st = await intentStatus(sessionRef);
			return st === 'SUCCEEDED'
				? 'complete'
				: st === 'CANCELLED' || st === 'EXPIRED'
					? 'expired'
					: 'open';
		}
	};
}
