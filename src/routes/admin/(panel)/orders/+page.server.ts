import { error } from '@sveltejs/kit';
import { recentOrders, sweepStaleOrders } from '$lib/server/commerce';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	await sweepStaleOrders(db).catch(() => 0);
	return { orders: await recentOrders(db) };
};
