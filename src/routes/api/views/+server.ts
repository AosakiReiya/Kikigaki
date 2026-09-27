import { eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { pageViews, posts } from '$lib/server/db/schema';
import { classifyChannel, refDomainOf } from '$lib/server/attribution';
import { emit } from '$lib/plugins';
import { locales } from '$lib/paraglide/runtime';
import type { RequestHandler } from './$types';

async function hashIp(ip: string): Promise<string> {
	const data = new TextEncoder().encode(`kikigaki:${ip}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function str(v: unknown, max: number): string | undefined {
	if (typeof v !== 'string') return undefined;
	const s = v.trim();
	return s ? s.slice(0, max) : undefined;
}

interface BeaconBody {
	path: unknown;
	locale?: unknown;
	session?: unknown;
	ref?: unknown;
	utm?: unknown;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env.DB ? getDb(platform.env.DB) : undefined;
	if (!db) return new Response(null, { status: 204 });

	let body: BeaconBody;
	try {
		body = await request.json();
	} catch {
		return new Response(null, { status: 400 });
	}

	const path = str(body.path, 500);
	if (!path || !path.startsWith('/') || path.startsWith('/api/') || path.startsWith('/admin')) {
		return new Response(null, { status: 400 });
	}

	// collected fields always get a light scrub (length caps + allowlists); dirty data is better dropped
	const locale = str(body.locale, 10);
	const session = str(body.session, 64);
	const utm = (typeof body.utm === 'object' && body.utm !== null ? body.utm : {}) as Record<
		string,
		unknown
	>;
	const utmSource = str(utm.utm_source, 128) ?? null;
	const utmMedium = str(utm.utm_medium, 128) ?? null;
	const utmCampaign = str(utm.utm_campaign, 128) ?? null;
	const utmContent = str(utm.utm_content, 128) ?? null;

	const selfHost = new URL(request.url).hostname.toLowerCase();
	const refDomain = refDomainOf(str(body.ref, 500), selfHost);
	const channel = classifyChannel({ refDomain, utmMedium, utmSource });

	const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
	const ipHash = await hashIp(ip);
	const viewDate = new Date().toISOString().slice(0, 10);

	try {
		const result = await db
			.insert(pageViews)
			.values({
				path,
				country: request.headers.get('cf-ipcountry') ?? undefined,
				userAgent: request.headers.get('user-agent')?.slice(0, 300),
				ipHash,
				viewDate,
				locale: locale && (locales as readonly string[]).includes(locale) ? locale : null,
				sessionId: session ?? null,
				refDomain,
				channel,
				utmSource,
				utmMedium,
				utmCampaign,
				utmContent
			})
			.onConflictDoNothing()
			.run();

		const inserted = (result.meta.changes ?? 0) > 0;

		if (inserted) {
			const slug = /^\/blog\/([^/]+)$/.exec(path)?.[1];
			if (slug) {
				await db
					.update(posts)
					.set({ views: sql`${posts.views} + 1` })
					.where(eq(posts.slug, slug));
			}
		}

		// event (Phase 21): the counting pipeline is open to any stats/integration plugin (no duplicate collection, broadcast only)
		await emit(
			'pageview:recorded',
			{ path, inserted, locale: locale ?? null, refDomain, utmSource, utmMedium },
			{ db: platform?.env.DB }
		);
	} catch {
		// stats must never affect the user experience
	}

	return new Response(null, { status: 204 });
};
