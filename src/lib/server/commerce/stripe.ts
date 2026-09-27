/**
 * Stripe Checkout (server-to-server, zero npm deps — the official API is just two endpoints).
 * Keys via env: STRIPE_SECRET (sk_…), STRIPE_WEBHOOK_SECRET (whsec_…).
 * Webhook verification = official scheme: t=timestamp,v1=hmac_sha256(secret, "t.body").
 */
import type { CheckoutProvider, CheckoutSession, WebhookOutcome } from './types';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_SEC = 5 * 60;

async function hmac(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export function createStripeProvider(secret: string, webhookSecret: string): CheckoutProvider {
	return {
		name: 'stripe',
		async createSession(order, lines, origin) {
			const form = new URLSearchParams();
			for (const [i, l] of lines.entries()) {
				form.set(`line_items[${i}][price_data][currency]`, order.currency);
				form.set(`line_items[${i}][price_data][unit_amount]`, String(l.priceCents));
				form.set(`line_items[${i}][price_data][product_data][name]`, l.title);
				form.set(`line_items[${i}][quantity]`, '1');
			}
			form.set('mode', 'payment');
			form.set('success_url', `${origin}/checkout/thanks?session={CHECKOUT_SESSION_ID}`);
			form.set('cancel_url', `${origin}/checkout/cancel`);
			form.set('client_reference_id', order.id);
			form.set('metadata[order_id]', order.id);
			const res = await fetch(`${API}/checkout/sessions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${secret}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: form
			});
			if (!res.ok) throw new Error(`stripe_session_${res.status}`);
			const j = (await res.json()) as { id: string; url?: string };
			return {
				orderId: order.id,
				provider: 'stripe',
				sessionRef: j.id,
				redirectUrl: j.url ?? `${origin}/checkout/error`
			} satisfies CheckoutSession;
		},
		async verifyWebhook(rawBody, headers) {
			const signatureHeader = headers.get('stripe-signature');
			if (!signatureHeader) return null;
			const parts = Object.fromEntries(
				signatureHeader
					.split(',')
					.map((kv) => kv.split('='))
					.filter(([k]) => k === 't' || k === 'v1')
					.map(([k, v]) => [k, v as string])
			);
			if (!parts.t || !parts.v1) return null;
			if (Math.abs(Date.now() / 1000 - Number(parts.t)) > TOLERANCE_SEC) return null;
			const expect = await hmac(webhookSecret, `${parts.t}.${rawBody}`);
			if (!safeEqual(expect, parts.v1)) return null;
			let event: { type?: string; data?: { object?: Record<string, unknown> } };
			try {
				event = JSON.parse(rawBody);
			} catch {
				return null;
			}
			const obj = event.data?.object ?? {};
			if (event.type === 'checkout.session.completed')
				return {
					handled: true,
					sessionRef: String(obj.id ?? ''),
					providerRef: typeof obj.payment_intent === 'string' ? obj.payment_intent : '',
					email:
						typeof (obj.customer_details as { email?: unknown })?.email === 'string'
							? String((obj.customer_details as { email: string }).email)
							: ''
				} satisfies WebhookOutcome;
			if (event.type === 'charge.refunded')
				return {
					handled: true,
					event: 'refunded',
					sessionRef: String(obj.payment_intent ?? '')
				} satisfies WebhookOutcome;
			return { handled: false };
		},
		async sessionStatus(_db, sessionRef) {
			const res = await fetch(`${API}/checkout/sessions/${encodeURIComponent(sessionRef)}`, {
				headers: { Authorization: `Bearer ${secret}` }
			});
			if (!res.ok) return 'open';
			const j = (await res.json()) as { payment_status?: string };
			return j.payment_status === 'paid' ? 'complete' : 'open';
		}
	};
}
