import { deLocalizeUrl, localizeHref } from '$lib/paraglide/runtime';
import type { Locale } from '$lib/paraglide/runtime';
import catalogJson from '../../config/locales-catalog.json';
import type { Catalog } from './i18n-config';

/**
 * Language metadata derives from config/locales-catalog.json (Phase 67-deploy):
 * - catalog is a superset, compiled locales a subset → lookups must decouple from the Locale type (Record derivation + assertion)
 * - labels are written in the language itself, deliberately not via message files
 */
export const LOCALE_CATALOG = catalogJson as unknown as Catalog;
const field = (k: 'label' | 'hreflang' | 'bcp47') =>
	Object.fromEntries(Object.entries(LOCALE_CATALOG).map(([code, v]) => [code, v[k]])) as Record<
		Locale,
		string
	>;

export const LOCALE_LABELS = field('label');
export const HREFLANG = field('hreflang');
export const BCP47 = field('bcp47');

/** Canonical (unlocalized) path of the current request/URL: /en/about → /about */
export function canonicalPath(href: string): string {
	return deLocalizeUrl(new URL(href, 'http://internal')).pathname;
}

/** canonical path → in-site link for a given locale (zh-tw has no prefix) */
export function localizedHref(path: string, locale: Locale): string {
	return localizeHref(path, { locale });
}
