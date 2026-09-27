/**
 * Built-in plugin: purchase thank-you mail (P83 hooks-consumer demo).
 * Subscribes to order:paid and emails the purchase_thanks template to the buyer —
 * the full path that previously only Core routes could touch now lives in a plugin:
 * events in, zero route changes. best-effort: without an email address or the
 * encryption master key it stays silent; send failures only hit console/email_logs
 * (the hooks engine isolates handler throws anyway).
 */
import { site } from '$lib/site';
import { sendTemplatedEmail } from '$lib/server/email-templates';
import type { Plugin } from '../types';

/** minor units → display string (zero-decimal currencies as-is) */
function formatTotal(cents: number, currency: string): string {
	const zeroDecimal = currency === 'jpy' || currency === 'twd';
	return `${currency.toUpperCase()} ${zeroDecimal ? cents : (cents / 100).toFixed(2)}`;
}

export const thankYouPlugin: Plugin = {
	manifest: {
		id: 'builtin-thank-you',
		name: 'Purchase Thank-you Mail',
		description: '訂單成交後寄出感謝信（含收據頁與下載入口）。',
		capabilities: ['send:email']
	},
	hooks: {
		on: {
			'order:paid': async (e, ctx) => {
				if (!ctx.db || !ctx.masterKey || !e.email) return;
				const r = await sendTemplatedEmail(ctx.db, ctx.masterKey, {
					to: e.email,
					type: 'purchase_thanks',
					vars: {
						'user.email': e.email,
						'order.total': formatTotal(e.totalCents, e.currency),
						'order.itemCount': String(e.itemCount),
						'order.url': `${site.url}/checkout/thanks?session_id=${e.orderId}`
					}
				});
				if (!r.ok) console.warn(`[plugin:thank-you] ${e.orderId}: ${r.error}`);
			}
		}
	}
};
