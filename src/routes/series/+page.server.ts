import { BASE_LOCALE, getSeriesCount, getSeriesIndex, SERIES_PAGE_SIZE } from '$lib/server/content';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
	const db = platform?.env.DB;
	if (!db) throw new Error('資料庫未配置');
	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
	const offset = (page - 1) * SERIES_PAGE_SIZE;
	const [series, total] = await Promise.all([
		getSeriesIndex(db, locale, { limit: SERIES_PAGE_SIZE, offset }),
		getSeriesCount(db)
	]);
	const totalPages = Math.max(1, Math.ceil(total / SERIES_PAGE_SIZE));
	const safePage = Math.min(page, totalPages);
	return {
		series,
		page: safePage,
		totalPages,
		meta: {
			title: m.series_title(),
			description: m.series_index_lede(),
			path: '/series'
		}
	};
};
