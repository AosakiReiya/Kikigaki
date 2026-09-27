/**
 * GET /api/download/[token] — the token IS the access (90 days, paid-only).
 * attachment + mojibake-safe filename (title sanitized); R2/local shim share one binding.
 */
import { takeDelivery } from '$lib/server/commerce';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = async ({ params, platform }) => {
	const db = platform?.env.DB;
	const bucket = platform?.env.BUCKET;
	if (!db || !bucket) return new Response(null, { status: 404 });
	const d = await takeDelivery(db, params.token);
	if (!d) return new Response(null, { status: 404 });
	const name = d.fileKey.split('/').pop() || 'download';
	const obj = await bucket.get(d.fileKey);
	if (!obj) {
		// local demo delivery: only under the mock double-gate (PAYMENT_PROVIDER=mock + ALLOW_MOCK_PAYMENTS=1)
		// both flags on to take effect — production never sets them; missing files 404 as usual.
		const env = platform?.env as unknown as Record<string, string | undefined> | undefined;
		if (env?.PAYMENT_PROVIDER !== 'mock' || env?.ALLOW_MOCK_PAYMENTS !== '1') {
			return new Response(null, { status: 404 });
		}
		const body = `Kikigaki 示範交付檔（本機 mock）\n\n商品：${d.title}\nkey：${d.fileKey}\n`;
		return new Response(body, {
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'content-disposition': `attachment; filename="sample-${encodeURIComponent(name)}"`,
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	}
	const ascii =
		d.title
			.replace(/[^\w.\- ]+/g, '')
			.trim()
			.replace(/\s+/g, '-') || name;
	return new Response(obj.body as unknown as BodyInit, {
		headers: {
			'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
			'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
