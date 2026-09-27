/**
 * PayPal — Orders v2 (plain fetch, zero SDK).
 * Money flow: create order (no charge) → buyer approves at PayPal → returns to thanks (?order=&f=1) →
 * finalize() captures server-side (idempotent; captures only when APPROVED). Buyer never returning = never charged.
 * Webhook PAYMENT.CAPTURE.COMPLETED is the late-settlement fallback: matched via resource.custom_id
 * (= our orderId; the order ref stored in provider_session); verification = official
 * verify-webhook-signature endpoint + cert_url domain allowlist (SSRF guard); needs PAYPAL_WEBHOOK_ID
 * (unset = all webhooks rejected).
 * env: PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_WEBHOOK_ID; PAYPAL_ENV=live switches endpoints.
 */
import {
	moneyString,
	type CheckoutProvider,
	type CheckoutSession,
	type WebhookOutcome
} from './types';

const SANDBOX = 'https://api-m.sandbox.paypal.com';
const LIVE = 'https://api-m.paypal.com';

export function createPayPalProvider(
	clientId: string,
	secret: string,
	webhookId: string,
	live: boolean
): CheckoutProvider {
	const base = live ? LIVE : SANDBOX;
	let tokenCache: { t: string; exp: number } = { t: '', exp: 0 };

	async function token(): Promise<string> {
		if (tokenCache.t && Date.now() < tokenCache.exp) return tokenCache.t;
		const r = await fetch(`${base}/v1/oauth2/token`, {
			method: 'POST',
			headers: {
				Authorization: 'Basic ' + btoa(`${clientId}:${secret}`),
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: 'grant_type=client_credentials'
		});
		if (!r.ok) throw new Error(`paypal_token_${r.status}`);
		const j = (await r.json()) as { access_token?: string; expires_in?: number };
		tokenCache = {
			t: String(j.access_token ?? ''),
			exp: Date.now() + Math.max(30, (j.expires_in ?? 300) - 60) * 1000
		};
		return tokenCache.t;
	}

	async function api(
		path: string,
		init?: RequestInit
	): Promise<{ status: number; json: Record<string, unknown> }> {
		const t = await token();
		const r = await fetch(base + path, {
			...init,
			headers: {
				Authorization: `Bearer ${t}`,
				'Content-Type': 'application/json',
				...(init?.headers ?? {})
			}
		});
		const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
		return { status: r.status, json };
	}

	return {
		name: 'paypal',
		async createSession(order, lines, origin) {
			const total = lines.reduce((a, l) => a + l.priceCents, 0);
			const { status, json } = await api('/v2/checkout/orders', {
				method: 'POST',
				body: JSON.stringify({
					intent: 'CAPTURE',
					purchase_units: [
						{
							reference_id: order.id,
							custom_id: order.id,
							amount: {
								currency_code: order.currency.toUpperCase(),
								value: moneyString(total, order.currency)
							}
						}
					],
					application_context: {
						user_action: 'PAY_NOW',
						return_url: `${origin}/checkout/thanks?order=${order.id}&f=1`,
						cancel_url: `${origin}/checkout/cancel`
					}
				})
			});
			if (status !== 201) throw new Error(`paypal_order_${status}`);
			const ref = String(json.id ?? '');
			const links = (json.links ?? []) as { rel?: string; href?: string }[];
			const approve =
				links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href ?? '';
			if (!ref || !approve) throw new Error('paypal_order_shape');
			return {
				orderId: order.id,
				provider: 'paypal',
				sessionRef: ref,
				redirectUrl: approve
			} satisfies CheckoutSession;
		},
		async verifyWebhook(rawBody, headers) {
			const transmissionId = headers.get('paypal-transmission-id');
			const time = headers.get('paypal-transmission-time');
			const sig = headers.get('paypal-transmission-sig');
			const algo = headers.get('paypal-auth-algo');
			const certUrl = headers.get('paypal-cert-url');
			if (!transmissionId || !time || !sig || !algo || !certUrl || !webhookId) return null;
			let ev: { event_type?: string; resource?: Record<string, unknown> };
			try {
				ev = JSON.parse(rawBody);
			} catch {
				return null;
			}
			if (ev.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return { handled: false };
			const certHost = (() => {
				try {
					return new URL(certUrl).hostname;
				} catch {
					return '';
				}
			})();
			if (certHost !== 'paypal.com' && !certHost.endsWith('.paypal.com')) return null;
			const { status, json } = await api('/v1/notifications/verify-webhook-signature', {
				method: 'POST',
				body: JSON.stringify({
					auth_algo: algo,
					cert_url: certUrl,
					transmission_id: transmissionId,
					transmission_sig: sig,
					transmission_time: time,
					webhook_id: webhookId,
					request_body: rawBody
				})
			});
			if (status !== 200 || String(json.verification_status ?? '') !== 'SUCCESS') return null;
			return {
				handled: true,
				sessionRef: String(ev.resource?.custom_id ?? ''),
				email: ''
			} satisfies WebhookOutcome;
		},
		async sessionStatus(_db, sessionRef) {
			const { status, json } = await api(`/v2/checkout/orders/${encodeURIComponent(sessionRef)}`);
			if (status !== 200) return 'open';
			return String(json.status ?? '') === 'COMPLETED' ? 'complete' : 'open';
		},
		async finalize(sessionRef) {
			const { status, json } = await api(`/v2/checkout/orders/${encodeURIComponent(sessionRef)}`);
			if (status !== 200) return 'open';
			const st = String(json.status ?? '');
			if (st === 'COMPLETED') return 'complete';
			if (st !== 'APPROVED') return 'open'; // not APPROVED yet = no charge; keep waiting
			const cap = await api(`/v2/checkout/orders/${encodeURIComponent(sessionRef)}/capture`, {
				method: 'POST',
				body: '{}'
			});
			if (cap.status === 201 && String(cap.json.status ?? '') === 'COMPLETED') return 'complete';
			return 'open';
		}
	};
}
