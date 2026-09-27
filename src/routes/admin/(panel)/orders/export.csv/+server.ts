/* * orders CSV export (provider-agnostic; for admin Excel / refund batch processing). */
import { recentOrders } from '$lib/server/commerce';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return new Response('db', { status: 500 });
	const rows = await recentOrders(db, 500);
	const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
	const lines = ['created_at,status,provider,currency,total_minor,email,items,kind,message'];
	for (const r of rows)
		lines.push(
			[
				r.createdAt ? new Date(r.createdAt).toISOString() : '',
				r.status,
				r.provider,
				r.currency,
				r.totalCents,
				r.email,
				r.itemCount,
				r.kind,
				r.message.replace(/[\r\n]+/g, ' ')
			]
				.map(esc)
				.join(',')
		);
	return new Response(lines.join('\n') + '\n', {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="orders.csv"',
			'cache-control': 'private, no-store'
		}
	});
};
