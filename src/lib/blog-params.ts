/**
 * /blog query-param pure functions (no server deps; shared by routes and theme packs).
 * URL as state (linkable, back-navigable, SSR): ?q= &tag= &year= &sort=new|views &page=N
 */

/** Category/series slug format (validity = has a mapping table; format only guards the URL) */
const CATEGORY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SERIES_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type BlogSort = 'new' | 'views';

/** Current filter state (excl. pagination; q is the fifth dimension, see BlogParams) */
export interface BlogFilterState {
	tag: string | null;
	year: number | null;
	sort: BlogSort;
	/** Content-type filter (Phase 52a; null = all) */
	/** Category slug (null = no filter; unknown slugs naturally yield empty lists) */
	type: string | null;
	/** Series filter (Phase 58.6: book context, admits series-only posts) */
	series: string | null;
	/** Show only "series-only" posts (sonly=1; mutually exclusive with series, series wins) */
	sonly: boolean;
}

/** Full parsed params */
export interface BlogParams extends BlogFilterState {
	page: number;
	/** Embedded full-text search keyword (≤64 chars; null = not searching) */
	q: string | null;
}

/** Page size for lists (kept in sync with server PAGE_SIZE; client load-more appends) */
export const BLOG_PAGE_SIZE = 12;

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const Q_MAX = 64;

/** Parse from URLSearchParams (invalid values fall back to defaults; never throws) */
export function parseBlogParams(sp: URLSearchParams): BlogParams {
	const page = Math.max(1, Number(sp.get('page') ?? '1') || 1);
	const rawTag = (sp.get('tag') ?? '').trim();
	const tag = rawTag.length > 0 ? rawTag : null;
	const rawYear = Number(sp.get('year'));
	const year =
		Number.isInteger(rawYear) && rawYear >= YEAR_MIN && rawYear <= YEAR_MAX ? rawYear : null;
	const sort: BlogSort = sp.get('sort') === 'views' ? 'views' : 'new';
	const rawQ = (sp.get('q') ?? '').trim().slice(0, Q_MAX);
	const q = rawQ.length > 0 ? rawQ : null;
	const rawType = (sp.get('type') ?? '').trim();
	const type = CATEGORY_SLUG_RE.test(rawType) ? rawType : null;
	const rawSeries = (sp.get('series') ?? '').trim();
	const series = SERIES_SLUG_RE.test(rawSeries) ? rawSeries : null;
	const sonly = sp.get('sonly') === '1';
	return { page, tag, year, sort, q, type, series, sonly };
}

/** Build the /blog query string (omit defaults; page 1 carries no param; never returns anything but a string) */
export function blogQuery(p: Partial<BlogParams>): string {
	const sp = new URLSearchParams();
	if (p.q) sp.set('q', p.q);
	if (p.tag) sp.set('tag', p.tag);
	if (p.type) sp.set('type', p.type);
	if (p.series) sp.set('series', p.series);
	if (p.sonly) sp.set('sonly', '1');
	if (p.year) sp.set('year', String(p.year));
	if (p.sort && p.sort !== 'new') sp.set('sort', p.sort);
	if (p.page && p.page > 1) sp.set('page', String(p.page));
	const qs = sp.toString();
	return qs ? `?${qs}` : '';
}
