/**
 * Mock provider — DEV demos and e2e. Runs the full "order → settle → deliver" flow without keys.
 * The production firewall lives in resolveProviders(): PAYMENT_PROVIDER=mock requires
 * ALLOW_MOCK_PAYMENTS=1 explicitly (self-host too); both on in production = a config accident, not a code accident.
 */
import { getDb } from '../db';
import { orders } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { CheckoutProvider, WebhookOutcome } from './types';

export function createMockProvider(): CheckoutProvider {
	return {
		name: 'mock',
		async createSession(order, _lines, origin) {
			return {
				orderId: order.id,
				provider: 'mock',
				sessionRef: `mock_${order.id}`,
				redirectUrl: `${origin}/checkout/thanks?session_id=mock_${order.id}`
			};
		},
		async verifyWebhook(rawBody) {
			let j: { session_id?: string; email?: string };
			try {
				j = JSON.parse(rawBody);
			} catch {
				return null;
			}
			if (!j.session_id) return null;
			return {
				handled: true,
				sessionRef: j.session_id,
				email: j.email ?? ''
			} satisfies WebhookOutcome;
		},
		async sessionStatus(db, sessionRef) {
			const row = await getDb(db)
				.select({ s: orders.status })
				.from(orders)
				.where(eq(orders.providerSession, sessionRef))
				.get();
			return row?.s === 'paid' ? 'complete' : 'open';
		}
	};
}
