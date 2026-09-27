import type { CommerceEnv } from '$lib/server/commerce/types';
import { getDb } from '$lib/server/db';
import { orders } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { resolveProviders } from '$lib/server/commerce';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
	const meta = { title: '', description: '', path: '/checkout/select' };
	const db = platform?.env.DB;
	const id = (url.searchParams.get('order') ?? '').slice(0, 40);
	if (!db || !/^[0-9a-f-]{36}$/.test(id)) return { order: null, providers: [], meta };
	const order = await getDb(db).select().from(orders).where(eq(orders.id, id)).get();
	// serves only "not yet attached" pending orders; everything else counts as nonexistent
	if (!order || order.status !== 'pending' || order.providerSession)
		return { order: null, providers: [], meta };
	const providers = resolveProviders(platform?.env as unknown as CommerceEnv).map((p) => p.name);
	return {
		order: { id: order.id, totalCents: order.totalCents, currency: order.currency },
		providers,
		meta
	};
};
