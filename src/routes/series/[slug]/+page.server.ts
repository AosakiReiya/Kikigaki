import { error, redirect } from '@sveltejs/kit';
import { BASE_LOCALE, getSeriesBook } from '$lib/server/content';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

/* * book cover page: with chapters, go straight to chapter one (book reading entries unify at chapter deep links) */
export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const book = await getSeriesBook(db, locale, params.slug);
	if (!book) error(404, '找不到這本書');
	if (book.chapters.length > 0) redirect(307, `/series/${book.book.slug}/${book.chapters[0].slug}`);

	return {
		book: book.book,
		chapters: book.chapters,
		meta: {
			title: `${book.book.title} · ${m.series_title()}`,
			description: book.book.summary || m.series_index_lede(),
			path: `/series/${book.book.slug}`,
			image: book.book.cover
		}
	};
};
