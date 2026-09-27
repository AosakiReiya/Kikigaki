/**
 * thanks page load: session_id (stripe/mock/airwallex lookup) or order&f=1
 * (paypal / hosted-style return wrap-up: finalize→capture). Both paths converge to:
 * while pending ask the provider → complete means markPaid → list deliveries.
 */
import type { CommerceEnv } from '$lib/server/commerce/types';
import { deliveriesForSession, findOrder, markPaid, resolveProviders } from '$lib/server/commerce';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const meta = { title: '', description: '', path: '/checkout/thanks' };
	const empty = { status: 'unknown', kind: '', items: [], meta };
	const db = platform?.env.DB;
	if (!db) return empty;
	const env = platform?.env as unknown as CommerceEnv;
	const providers = resolveProviders(env);
	const ref =
		url.searchParams.get('session_id') ??
		url.searchParams.get('session') ??
		url.searchParams.get('order') ??
		'';
	if (!ref || ref.length > 80) return empty;
	const order = await findOrder(db, ref.slice(0, 64));
	if (!order) return empty;
	const provider = providers.find((p) => p.name === order.provider);
	let status = order.status;
	if (status === 'pending' && provider && order.providerSession) {
		// return-trip wrap-up (?f=1 with finalize = paypal capture); other paths are read-only checks. 8s budget.
		const needFinal = url.searchParams.get('f') === '1' && provider.finalize;
		const probe = needFinal
			? provider.finalize!(order.providerSession)
			: provider.sessionStatus(db, order.providerSession);
		const s = await Promise.race([
			probe,
			new Promise<string>((r) => setTimeout(() => r('timeout'), 8000))
		]).catch(() => 'open');
		if (s === 'complete') {
			const res = await markPaid(db, order.providerSession, '', undefined, {
				masterKey: (platform?.env as unknown as { AI_SECRET?: string })?.AI_SECRET
			});
			if (res.ok) status = 'paid';
		}
	}
	const d = await deliveriesForSession(db, order.providerSession ?? order.id);
	return {
		status:
			status === 'paid' || d.status === 'paid'
				? 'paid'
				: d.status === 'unknown'
					? status
					: d.status,
		kind: d.kind,
		items: d.items,
		meta
	};
};
