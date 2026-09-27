import { error } from '@sveltejs/kit';
import { eventsAfter } from '$lib/agent/runtime/store';
import { ownedSession } from '$lib/agent/runtime/api-server';
import { sseResponse, sleep } from '$lib/agent/runtime/sse';
import type { RequestHandler } from './$types';

/* * GET ?cursor= → event tailing (25s long-poll cycles; the client resumes with the cursor) */
export const GET: RequestHandler = async ({ platform, locals, params, url, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const session = await ownedSession(db, params.id, locals.user!.id);
	if (!session) error(404, 'not_found');
	let cursor = Number(url.searchParams.get('cursor') ?? '0');
	// EventSource reconnects carry the cursor automatically (seamless continuation)
	const lastEventId = Number(request.headers.get('last-event-id') ?? '');
	if (Number.isFinite(lastEventId) && lastEventId > cursor) cursor = lastEventId;
	if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

	return sseResponse(async (h) => {
		const deadline = Date.now() + 25_000;
		let sent = 0;
		for (;;) {
			const rows = await eventsAfter(db, session.id, cursor);
			for (const r of rows) {
				cursor = r.id;
				h.send(r.type, { id: r.id, payload: r.payload });
				sent++;
			}
			if (rows.length === 0) {
				if (sent > 0) break; // catch-up mode: finish delivering existing events then close; the client reconnects with the cursor
				if (Date.now() > deadline) break;
				await sleep(1500);
			}
		}
		h.send('stream.cursor', { cursor });
		h.close();
	});
};
