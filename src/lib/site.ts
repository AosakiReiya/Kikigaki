/**
 * Site-wide deploy-time config (rarely changed, shared site-wide, tiny static data).
 * Edit here → effective on redeploy; no database involved.
 *
 * - site name / author / avatar / SEO description: edit here
 * - social links: one more line = one more link (logo / logo+text / text only)
 *   - `icon`: built-in SocialIcon.svelte icon key (github / x / youtube / rss …); unknown falls back to text
 *   - `display`: 'icon' (logo only) | 'icon+label' (logo+text) | 'label' (text only)
 */
export type SocialDisplay = 'icon' | 'icon+label' | 'label';

export interface SocialLink {
	id: string;
	label: string;
	url: string;
	icon: string;
	display: SocialDisplay;
}

const socials: SocialLink[] = [
	{
		id: 'github',
		label: 'GitHub',
		url: '',
		icon: 'github',
		display: 'icon+label'
	},
	{
		id: 'youtube',
		label: 'YouTube',
		url: '',
		icon: 'youtube',
		display: 'icon+label'
	},
	{
		id: 'facebook',
		label: 'Facebook',
		url: '',
		icon: 'facebook',
		display: 'icon+label'
	},
	{
		id: 'x',
		label: 'X / Twitter',
		url: '',
		icon: 'x',
		display: 'icon+label'
	},
	{
		id: 'rss',
		label: 'RSS',
		url: '/rss.xml',
		icon: 'rss',
		display: 'label'
	}
];

/* ------------------------------------------------------------------ */
/* Runtime override layer (Phase 65): site identity became admin-editable, synced across SSR/hydration   */
/* - values come from site_settings (applied by layout on every render); empty string = fall back to static default   */
/* - single-site semantics: all requests read one value set, so module-level caching is fine (no cross-tenant risk) */
/* ------------------------------------------------------------------ */

export interface SiteRuntime {
	name?: string;
	shortName?: string;
	description?: string;
	authorName?: string;
	footerText?: string;
	copyright?: string;
	timezone?: string;
	/** Phase 77: social link overrides (id → url/display; display 'hidden' = hide the item; empty url = use default) */
	socials?: Record<string, { url?: string; display?: SocialDisplay | 'hidden' }>;
	/** Phase 68R: author handle and canonical site URL (admin overrides; changing the URL is SEO-sensitive) */
	authorHandle?: string;
	siteUrl?: string;
}

/** Factory-neutral defaults (68R): real site data lives in DB (settings runtime overrides) and custom env;
 *  runs after fork without changing a line of code — fill name/author/socials/URL in admin and it's yours */
const STATIC = {
	title: 'Kikigaki',
	description: '記錄與觀察的站點 —— 在後台「網站識別」改寫這段話。',
	url: 'https://example.com',
	authorName: 'Site Owner',
	username: 'owner',
	avatar: '/avatar.webp'
};

let runtime: SiteRuntime = {};

/** socials_config JSON → runtime override table (shared by settings and layout; client-safe pure function) */
export function parseSocialsConfig(
	raw: string | undefined | null
): Record<string, { url?: string; display?: SocialDisplay | 'hidden' }> | undefined {
	if (!raw) return undefined;
	try {
		const obj = JSON.parse(raw) as Record<string, { url?: unknown; display?: unknown }>;
		const out: Record<string, { url?: string; display?: SocialDisplay | 'hidden' }> = {};
		for (const [id, v] of Object.entries(obj)) {
			const entry: { url?: string; display?: SocialDisplay | 'hidden' } = {};
			if (typeof v?.url === 'string') entry.url = v.url;
			if (
				v?.display === 'icon' ||
				v?.display === 'icon+label' ||
				v?.display === 'label' ||
				v?.display === 'hidden'
			)
				entry.display = v.display;
			if (entry.url !== undefined || entry.display) out[id] = entry;
		}
		return Object.keys(out).length ? out : undefined;
	} catch {
		return undefined;
	}
}

const SOCIAL_DEFAULTS = socials;

/** build-time static defaults (for Settings-page placeholder hints; unaffected by runtime overrides) */
export const SITE_DEFAULTS = {
	title: STATIC.title,
	description: STATIC.description,
	authorName: STATIC.authorName,
	url: STATIC.url
};

/** idempotent apply (called by layout on every render; empty values always fall back to static defaults) */
/** whether the site description is admin-overridden (home meta chain needs the raw value; STATIC fallback excluded) */
export function runtimeSiteDescription(): string | undefined {
	return runtime.description;
}

import type { SiteSettings } from '$lib/server/settings';

/** SiteSettings → SiteRuntime (the single mapping shared by SSR and hydration — no hand-copy field drift) */
export function siteRuntimeOf(s: SiteSettings, locale?: string): SiteRuntime {
	// 79-i18n: localizable fields take the locale value first; empty = fall back to site-level monolingual (same semantics as identityFor)
	const pick = (bag: Record<string, string> | undefined) => (locale ? (bag?.[locale] ?? '') : '');
	return {
		name: s.name,
		shortName: s.shortName,
		description: pick(s.descriptions) || s.siteDescription,
		authorName: s.authorName,
		footerText: pick(s.footers) || s.footerText,
		copyright: pick(s.copyrights) || s.copyright,
		timezone: s.timezone,
		socials: parseSocialsConfig(s.socialsConfig),
		authorHandle: s.authorHandle,
		siteUrl: s.siteUrl
	};
}

export function applySiteRuntime(o: SiteRuntime | null | undefined): void {
	runtime = {
		name: o?.name?.trim() || undefined,
		shortName: o?.shortName?.trim() || undefined,
		description: o?.description?.trim() || undefined,
		authorName: o?.authorName?.trim() || undefined,
		footerText: o?.footerText?.trim() || undefined,
		copyright: o?.copyright?.trim() || undefined,
		timezone: o?.timezone?.trim() || undefined,
		socials: o?.socials ?? undefined,
		authorHandle: o?.authorHandle?.trim() || undefined,
		siteUrl: /^https:\/\/[-\w.]+(:\d+)?$/.test(o?.siteUrl?.trim?.() ?? '')
			? o?.siteUrl?.trim?.()
			: undefined
	};
}

/** currently effective site identity (priority: runtime → static). url deliberately NOT runtime-overridable */
export const site = {
	get title(): string {
		return runtime.name || STATIC.title;
	},
	/** short name (nav/logo text; unset = site name) */
	get shortName(): string {
		return runtime.shortName || site.title;
	},
	get description(): string {
		return runtime.description || STATIC.description;
	},
	/** canonical absolute URL (factory placeholder; fill the real domain in admin "Site Identity" — SEO-sensitive, sync DNS/redirects after changing) */
	get url(): string {
		return runtime.siteUrl || STATIC.url;
	},
	get timezone(): string {
		return runtime.timezone || 'Asia/Taipei';
	},
	get footerText(): string {
		return runtime.footerText ?? '';
	},
	get copyright(): string {
		return runtime.copyright ?? '';
	},
	author: {
		get name(): string {
			return runtime.authorName || STATIC.authorName;
		},
		get username(): string {
			return runtime.authorHandle || STATIC.username;
		},
		avatar: STATIC.avatar
	},
	/** public contact email (for the CONTACT block; empty = hidden) */
	email: '',
	/** social links: STATIC factory values + runtime overrides (empty-string url override = hide that item) */
	get socials(): SocialLink[] {
		const ov = runtime.socials ?? {};
		return SOCIAL_DEFAULTS.flatMap((x) => {
			const o = ov[x.id];
			if (!o) return x.url ? [x] : [];
			if (o.display === 'hidden') return [];
			const url = o.url?.trim() || x.url;
			return url ? [{ ...x, url, display: o.display ?? x.display }] : [];
		});
	}
};
