import { redirect } from '@sveltejs/kit';
import { BASE_LOCALE, PAGE_SIZE } from '$lib/server/content';
import { searchPosts } from '$lib/server/search';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

const MAX_QUERY = 64;

export const load: PageServerLoad = async ({ url, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) throw new Error('資料庫未配置');

	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	if (!query) {
		return {
			query: '',
			results: [],
			total: 0,
			page: 1,
			totalPages: 1,
			meta: {
				title: m.nav_search(),
				description: m.search_meta_desc(),
				path: '/search'
			}
		};
	}

	const { results, total } = await searchPosts(db, locale, query, {
		limit: PAGE_SIZE,
		offset: (page - 1) * PAGE_SIZE
	});

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	if (page > totalPages) {
		throw redirect(
			307,
			`/search?q=${encodeURIComponent(query)}${totalPages > 1 ? `&page=${totalPages}` : ''}`
		);
	}

	return {
		query,
		results,
		total,
		page,
		totalPages,
		meta: {
			title: `${query} · ${m.nav_search()}`,
			description: m.search_meta_desc(),
			path: '/search'
		}
	};
};
