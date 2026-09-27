import { error } from '@sveltejs/kit';
import { BASE_LOCALE, getChapterForBook } from '$lib/server/content';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const r = await getChapterForBook(db, locale, params.slug, params.chapter);
	if (r === 'no-book') error(404, '找不到這本書');
	if (r === 'no-chapter') error(404, '這本書沒有這個章節');

	return {
		...r,
		// hreflang lists only the locales this chapter actually has translations for
		hreflangLocales: r.current.availableLocales,
		meta: {
			title: `${r.current.title} · ${r.book.title}`,
			description: r.current.summary,
			path: `/series/${r.book.slug}/${r.current.slug}`,
			image: r.current.cover ?? r.book.cover,
			type: 'article' as const,
			publishedTime: r.current.date
		}
	};
};
