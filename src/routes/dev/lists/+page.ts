import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const prerender = false;
/* ssr=true: the gate must run on the server — with ssr=false, document returns a 200 shell first and
   load's error(404) only takes effect client-side; production status codes would lie */
export const ssr = true;

/**
 * List testing/lab pages (58.11): open only on local dev and preview branch aliases;
 * production (the real custom domain / main pages.dev domain) always 404s.
 */
export const load: PageLoad = ({ url }) => {
	const host = url.host;
	const allowed =
		import.meta.env.DEV ||
		host.startsWith('feat-component-platform-plan.') ||
		host.startsWith('preview-');
	if (!allowed) error(404, 'not_found');
	return {};
};
