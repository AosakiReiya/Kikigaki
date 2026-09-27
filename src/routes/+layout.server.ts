import { publishDuePosts, BASE_LOCALE, getTags } from '$lib/server/content';
import { getSettings, siteRuntimeOf } from '$lib/server/settings';
import { getTheme, isDbThemeId, sanitizeTokensForSsr } from '$lib/server/themes';
import { applySiteRuntime } from '$lib/site';
import { getNavPages } from '$lib/server/pages';
import { ensureThemePack } from '$lib/themes/registry';
import type { Locale } from '$lib/paraglide/runtime';
import type { LayoutServerLoad } from './$types';

/**
 * Root layout data (site-wide):
 * - settings: logo / hero background / slogan (admin-editable, SSR-live)
 * - navTags: the nav "Categories" dropdown
 * - navPages: published custom pages with showInNav (bare-path navigation, by navOrder)
 * - searchIndex: overlay-search title + summary + tag index (current locale, untranslated falls back to base)
 */
export const load: LayoutServerLoad = async ({ platform, locals }) => {
	const db = platform?.env.DB;
	// Phase 67 scheduled publishing: opportunistically flip due posts before page reads (best-effort; zero cost when nothing is due)
	if (db) await publishDuePosts(db).catch(() => {});
	if (!db) return { settings: null, navTags: [], navPages: [] };

	const locale: Locale = locals.locale ?? BASE_LOCALE;
	// Phase 65: the root layout load runs before all page loads → apply it here,
	// later in-page site.* reads get the runtime values (re-applied per request to prevent isolate residue)
	const [settings, tags, navPages] = await Promise.all([
		getSettings(db),
		getTags(db, locale),
		getNavPages(db, locale)
	]);
	applySiteRuntime(siteRuntimeOf(settings, locale));

	// 79a-slim: land the active pack before entering page load ([slug]'s theme-route resolution is a synchronous read)
	await ensureThemePack(settings.uiTheme);

	// P2 (78c): SSR-inline the active DB theme's tokens — colors/fonts land on first
	// paint; only structural surfaces keep the base-pack fallback until compiled.
	let dbThemeTokens: { id: string; css: string } | null = null;
	if (isDbThemeId(settings.uiTheme)) {
		const t = await getTheme(db, settings.uiTheme);
		if (t?.tokensCss.trim()) dbThemeTokens = { id: t.id, css: sanitizeTokensForSsr(t.tokensCss) };
	}

	return { settings, navTags: tags, navPages, dbThemeTokens };
};
