import { and, eq, gte, like, ne, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { pageViews, postTranslations, posts } from '$lib/server/db/schema';
import { BASE_LOCALE } from '$lib/server/content';
import type { PageServerLoad } from './$types';

const RANGES = {
	today: '今天',
	'7d': '7 天',
	'30d': '30 天',
	'90d': '90 天',
	all: '全部'
} as const;

type RangeKey = keyof typeof RANGES;

function dateCondition(range: RangeKey) {
	const today = new Date().toISOString().slice(0, 10); // viewDate recorded in UTC
	if (range === 'today') return eq(pageViews.viewDate, today);
	if (range === 'all') return sql`1`;
	const days = Number(range.slice(0, -1));
	const cut = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
	return gte(pageViews.viewDate, cut);
}

/* * path='/blog/<slug>' → base-language title subquery (posts.id convention is 'post:<slug>') */
const blogTitle = sql<string>`COALESCE((SELECT title FROM post_translations WHERE post_id = 'post:' || substr(${pageViews.path}, 7) AND locale = ${BASE_LOCALE}), '')`;

const POST_PATH = like(pageViews.path, '/blog/%');
const slugOfPath = sql<string>`substr(${pageViews.path}, 7)`;

/**
 * Browser location.pathname percent-encodes non-ASCII slugs (/blog/%E5%A4%A2-%E4%BF%A1)
 * while posts.slug stores the decoded form — decode uniformly before title matching and display.
 */
function dec(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s; // anomalous values containing bare % stay as-is
	}
}

export const load: PageServerLoad = async ({ url, platform }) => {
	const raw = url.searchParams.get('range');
	const range: RangeKey = raw && raw in RANGES ? (raw as RangeKey) : '30d';

	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, range };

	const kit = getDb(db);
	const where = dateCondition(range);

	const [
		totals,
		daily,
		topPosts,
		byLocale,
		byChannel,
		byReferrer,
		campaigns,
		postLocale,
		postChannel,
		titleRows
	] = await Promise.all([
		kit
			.select({
				pv: sql<number>`count(*)`,
				uv: sql<number>`count(distinct ${pageViews.ipHash})`,
				sessions: sql<number>`count(distinct ${pageViews.sessionId})`
			})
			.from(pageViews)
			.where(where),
		kit
			.select({
				date: pageViews.viewDate,
				pv: sql<number>`count(*)`,
				uv: sql<number>`count(distinct ${pageViews.ipHash})`
			})
			.from(pageViews)
			.where(where)
			.groupBy(pageViews.viewDate)
			.orderBy(pageViews.viewDate),
		kit
			.select({
				slug: slugOfPath,
				title: blogTitle,
				pv: sql<number>`count(*)`,
				uv: sql<number>`count(distinct ${pageViews.ipHash})`
			})
			.from(pageViews)
			.where(and(POST_PATH, where))
			.groupBy(pageViews.path)
			.orderBy(sql`count(*) desc`)
			.limit(10),
		kit
			.select({ locale: pageViews.locale, pv: sql<number>`count(*)` })
			.from(pageViews)
			.where(where)
			.groupBy(pageViews.locale)
			.orderBy(sql`count(*) desc`),
		kit
			.select({ channel: pageViews.channel, pv: sql<number>`count(*)` })
			.from(pageViews)
			.where(where)
			.groupBy(pageViews.channel)
			.orderBy(sql`count(*) desc`),
		kit
			.select({ domain: pageViews.refDomain, pv: sql<number>`count(*)` })
			.from(pageViews)
			.where(and(where, ne(pageViews.refDomain, '')))
			.groupBy(pageViews.refDomain)
			.orderBy(sql`count(*) desc`)
			.limit(10),
		kit
			.select({
				source: pageViews.utmSource,
				medium: pageViews.utmMedium,
				campaign: pageViews.utmCampaign,
				pv: sql<number>`count(*)`
			})
			.from(pageViews)
			.where(and(where, sql`${pageViews.utmCampaign} is not null`))
			.groupBy(pageViews.utmSource, pageViews.utmMedium, pageViews.utmCampaign)
			.orderBy(sql`count(*) desc`)
			.limit(20),
		kit
			.select({ slug: slugOfPath, locale: pageViews.locale, pv: sql<number>`count(*)` })
			.from(pageViews)
			.where(and(POST_PATH, where))
			.groupBy(pageViews.path, pageViews.locale),
		kit
			.select({ slug: slugOfPath, channel: pageViews.channel, pv: sql<number>`count(*)` })
			.from(pageViews)
			.where(and(POST_PATH, where))
			.groupBy(pageViews.path, pageViews.channel),
		kit
			.select({ slug: posts.slug, title: postTranslations.title })
			.from(postTranslations)
			.innerJoin(posts, eq(postTranslations.postId, posts.id))
			.where(eq(postTranslations.locale, BASE_LOCALE))
	]);

	const titles = Object.fromEntries(titleRows.map((t) => [t.slug, t.title]));

	return {
		dbReady: true as const,
		range,
		ranges: Object.entries(RANGES).map(([k, label]) => ({ key: k as RangeKey, label })),
		totals: {
			pv: Number(totals[0]?.pv ?? 0),
			uv: Number(totals[0]?.uv ?? 0),
			sessions: Number(totals[0]?.sessions ?? 0)
		},
		daily: daily.map((d) => ({ date: d.date, pv: Number(d.pv), uv: Number(d.uv) })),
		topPosts: topPosts.map((r) => {
			const slug = dec(r.slug);
			return { slug, title: r.title || titles[slug] || slug, pv: Number(r.pv), uv: Number(r.uv) };
		}),
		byLocale: byLocale.map((r) => ({ locale: r.locale ?? '(舊資料)', pv: Number(r.pv) })),
		byChannel: byChannel.map((r) => ({ channel: r.channel ?? '(舊資料)', pv: Number(r.pv) })),
		byReferrer: byReferrer.map((r) => ({ domain: r.domain ?? '', pv: Number(r.pv) })),
		campaigns: campaigns.map((r) => ({
			source: r.source ?? '',
			medium: r.medium ?? '',
			campaign: r.campaign ?? '',
			pv: Number(r.pv)
		})),
		postLocale: postLocale.map((r) => ({
			slug: dec(r.slug),
			locale: r.locale ?? '',
			pv: Number(r.pv)
		})),
		postChannel: postChannel.map((r) => ({
			slug: dec(r.slug),
			channel: r.channel ?? '',
			pv: Number(r.pv)
		})),
		titles
	};
};
