import {
	BASE_LOCALE,
	getPinnedPostSummaries,
	getPublishedPostSummaries,
	getTags
} from '$lib/server/content';
import { site } from '$lib/site';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

/* * home post-section count (showcase semantics: displays "what's being written lately"; full browsing lives at /blog)*/
const HOME_POSTS_LIMIT = 8;

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) throw new Error('資料庫未配置');

	const locale: Locale = locals.locale ?? BASE_LOCALE;

	const [posts, pinned, tags] = await Promise.all([
		getPublishedPostSummaries(db, locale, { limit: HOME_POSTS_LIMIT }),
		getPinnedPostSummaries(db, locale),
		getTags(db, locale)
	]);

	return {
		posts,
		pinned,
		tags,
		meta: {
			title: site.title,
			// '' = hand off to the layout's site-description chain (site description → slogan → tagline)
			description: '',
			path: '/'
		}
	};
};
