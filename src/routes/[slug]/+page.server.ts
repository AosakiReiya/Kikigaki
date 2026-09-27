import { error } from '@sveltejs/kit';
import { getPublishedPage } from '$lib/server/pages';
import { getSettings } from '$lib/server/settings';
import { resolveThemeRoute } from '$lib/themes/routes';
import { getType, listItems } from '$lib/server/content-items';
import { BASE_LOCALE } from '$lib/server/content';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

/**
 * Custom-page catch-all (Phase 20.6) — bare path /{slug}.
 * SvelteKit static segments outrank dynamic ones: /about, /blog, /admin are never shadowed;
 * admin creation additionally guards with RESERVED_PAGE_SLUGS. Unpublished/missing → 404.
 */
export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');

	const locale: Locale = locals.locale ?? BASE_LOCALE;

	// 78f (B1): theme context routes take priority (e.g. corporate /services); abstract = no routes = bit-identical to status quo
	const settings = await getSettings(db);
	const route = resolveThemeRoute(settings.uiTheme, params.slug);
	if (route) {
		const tc = settings.themeContent;
		const pages = (tc.pages ?? {}) as Record<string, unknown>;
		const content = pages[params.slug] as Record<string, unknown> | undefined;
		return {
			themeRoute: { path: route.path, surface: route.surface },
			content,
			themeContent: tc,
			meta: {
				title: typeof content?.title === 'string' ? content.title : params.slug,
				description: typeof content?.summary === 'string' ? content.summary : '',
				path: `/${params.slug}`
			}
		};
	}

	// 79d: public list for dynamic content types (/key) — enabled only; the same block also stops page slugs colliding at creation
	const dynType = await getType(db, params.slug);
	if (dynType?.enabled) {
		const { items } = await listItems(db, dynType.key, { publishedOnly: true, limit: 48 });
		return {
			genericList: {
				typeKey: dynType.key,
				label: dynType.label,
				titleField: dynType.titleField,
				items
			},
			meta: {
				title: dynType.label,
				description: '',
				path: `/${dynType.key}`
			}
		};
	}

	const page = await getPublishedPage(db, params.slug, locale);
	if (!page) error(404, '找不到此頁面');

	return {
		page,
		hreflangLocales: page.availableLocales,
		meta: {
			title: page.title,
			description: page.summary,
			path: `/${page.slug}`
		}
	};
};
