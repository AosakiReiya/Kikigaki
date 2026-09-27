/**
 * Phase 79e-1 — payment provider interface (digital goods only).
 * WeChat Pay / Alipay implementations will live in this directory (the interface reserves their seat);
 * the orders table carries no stripe-specific vocabulary.
 */
import type { D1Database } from '@cloudflare/workers-types';

export interface CheckoutLine {
	typeKey: string;
	slug: string;
	title: string;
	priceCents: number;
	fileKey: string;
}

export interface CheckoutSession {
	orderId: string;
	provider: string;
	/** redirect target (stripe = remote checkout; mock = on-site thanks page) */
	redirectUrl: string;
	/** identifier stored in orders.provider_session (for webhook/thanks lookups) */
	sessionRef: string;
}

export interface WebhookOutcome {
	/** only checkout completion/refund events are honored; others (ping etc.) return handled=false with a silent 200 */
	handled: boolean;
	/** default 'completed'; 'refunded' takes the revocation path */
	event?: 'completed' | 'refunded';
	sessionRef?: string;
	email?: string;
	/** external payment identifier (stripe payment_intent / paypal capture…), used to look up refund events */
	providerRef?: string;
}

export interface CheckoutProvider {
	name: string;
	createSession(
		order: { id: string; currency: string },
		lines: CheckoutLine[],
		origin: string
	): Promise<CheckoutSession>;
	/** verify signature + parse; null on failure (callers 400). rawBody must be the unparsed original */
	verifyWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome | null>;
	/** thanks-page status check ('open' = not finished yet) */
	sessionStatus(db: D1Database, sessionRef: string): Promise<'open' | 'complete' | 'expired'>;
	/**
	 * Optional: wrap up when the buyer returns from checkout (PayPal = server capture after return;
	 * no return = no charge). Returning 'complete' settles the order (caller runs markPaid).
	 */
	finalize?(sessionRef: string): Promise<'open' | 'complete' | 'expired'>;
}

/** product contract: price field = "12.00"-style two decimals; invalid returns null. Unit = minor units. */
export function parsePriceCents(raw: unknown, currency: string): number | null {
	if (typeof raw !== 'string') return null;
	const m = /^(\d{1,6})(?:\.(\d{2}))?$/.exec(raw.trim());
	if (!m) return null;
	// zero-decimal currencies (JPY/TWD): fold the fraction into the integer (9.50 JPY writes 950)
	const frac = m[2] ?? '00';
	const cents =
		currency.toLowerCase() === 'jpy' || currency.toLowerCase() === 'twd'
			? parseInt(m[1], 10) * (frac === '00' ? 1 : 100) + (frac === '00' ? 0 : parseInt(frac, 10))
			: parseInt(m[1], 10) * 100 + parseInt(frac, 10);
	return cents > 0 ? cents : null;
}

/** checkout amount string (zero-decimal currencies carry no decimal point) */
export function moneyString(totalCents: number, currency: string): string {
	return currency.toLowerCase() === 'jpy' || currency.toLowerCase() === 'twd'
		? String(totalCents)
		: (totalCents / 100).toFixed(2);
}

/** env keys needed for provider selection (a subset view of platform.env) */
export interface CommerceEnv {
	PAYMENT_PROVIDER?: string;
	ALLOW_MOCK_PAYMENTS?: string;
	STRIPE_SECRET?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	PAYPAL_CLIENT_ID?: string;
	PAYPAL_SECRET?: string;
	PAYPAL_WEBHOOK_ID?: string;
	PAYPAL_ENV?: string;
	AIRWALLEX_CLIENT_ID?: string;
	AIRWALLEX_API_KEY?: string;
	AIRWALLEX_WEBHOOK_SECRET?: string;
	AIRWALLEX_ENV?: string;
	COMMERCE_CURRENCY?: string;
	ORIGIN?: string;
}
