import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/* * legacy tag URLs (handled by /blog?tag= since Phase 50): 301 preserves SEO weight */
export const load: PageServerLoad = async ({ params, url }) => {
	const tag = decodeURIComponent(params.tag);
	const page = url.searchParams.get('page');
	const suffix = page && Number(page) > 1 ? `&page=${encodeURIComponent(page)}` : '';
	throw redirect(301, `/blog?tag=${encodeURIComponent(tag)}${suffix}`);
};
