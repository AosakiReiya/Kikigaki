import { json } from '@sveltejs/kit';
import { publishDuePosts } from '$lib/server/content';
import { sweepStaleOrders } from '$lib/server/commerce';
import type { RequestHandler } from './$types';

/**
 * Phase 73: scheduled-publish keepalive endpoint (GitHub Actions cron every 10 minutes; traffic-less sites still publish on time).
 * Auth: x-cron-key === env.CRON_SECRET (no secret set = 403 fail-closed).
 * lazy publish still runs at every read entry — this endpoint is just punctuality insurance, not the only path.
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json({ ok: false, error: 'no_db' }, { status: 500 });
	const secret = platform.env.CRON_SECRET;
	if (!secret) return json({ ok: false, error: 'cron_not_configured' }, { status: 403 });
	const key = request.headers.get('x-cron-key') ?? '';
	if (key !== secret) return json({ ok: false, error: 'unauthorized' }, { status: 401 });
	const flipped = await publishDuePosts(db);
	// 84: ghost-order hygiene — pending checkouts older than 24h (provider sessions expire anyway)
	const swept = await sweepStaleOrders(db).catch(() => 0);
	return json({ ok: true, flipped, swept });
};
