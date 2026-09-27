import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from './db';
import { siteSettings } from './db/schema';
import { eq, inArray, like, or } from 'drizzle-orm';
import { isValidThemeId, type ActiveThemeId } from '$lib/themes';
import { mergeSupportAssignments, parseSlotAssignments } from '$lib/slots/catalog';
import {
	SETTINGS_FIELDS,
	cleanFieldValue,
	splitPluginRows,
	pluginSettingsKey,
	PLUGIN_SETTINGS_PREFIX,
	PLUGIN_SETTINGS_MAX_BYTES
} from './settings-registry';
import { locales as RUNTIME_LOCALES } from '$lib/paraglide/runtime';

export interface WorkEntry {
	title: string;
	href: string;
	description?: string;
	badge?: string;
	date?: string;
	cover?: string;
}

export interface SiteSettings {
	/** header logo image (media-library URL; empty = text branding) */
	logo: string;
	/** home hero background image */
	heroBg: string;
	/** site-level default share image (fallback when a post has no cover/OG image) */
	defaultOgImage: string;
	/** site identity (Phase 65; empty string = fall back to build-time static defaults) */
	name: string;
	shortName: string;
	siteDescription: string;
	authorName: string;
	authorHandle: string;
	siteUrl: string;
	footerText: string;
	copyright: string;
	timezone: string;
	/** X/Twitter site account (@handle) */
	twitterSite: string;
	/** Phase 77: social link overrides JSON (id → {url,display}) */
	socialsConfig: string;
	/** per-locale slogans (key = locale) */
	slogans: Record<string, string>;
	/** 79-i18n: per-locale site identity fields (key = locale; '' = fall back to the site-level value) */
	descriptions: Record<string, string>;
	footers: Record<string, string>;
	copyrights: Record<string, string>;
	aboutBodies: Record<string, string>;
	/** per-locale works lists (present only with non-empty entries; missing = fall back to site-level works) */
	worksByLocale: Record<string, WorkEntry[]>;
	/** 78f (B1): theme context content (owner-filled JSON: nav/hero/pages/services… theme-defined keys) */
	themeContent: Record<string, unknown>;
	/** about-page body (markdown; empty string = use the default copy) */
	aboutBody: string;
	/** design theme (Phase 20; abstract = current baseline) */
	uiTheme: ActiveThemeId; // 78c: may be a db- theme; the renderer naturally falls back until it's compile-ready
	/** Agent instruction layer (Phase 28 · SITE.md isomorph; injected at the top of the system prompt) */
	agentInstructions: string;
	/** 79e-3: support card surfaces (subset of 'post,support,about'; empty = off) */
	supportSurfaces: string;
	/** P83a: slot assignments (slot name → component id list; sanitized, catalog slots only) */
	slotAssignments: Record<string, string[]>;
	/** P83b: plugin settings (plugin.<id> namespace; one JSON object per plugin) */
	pluginSettings: Record<string, Record<string, unknown>>;
	/** 84: shop currency ('' = auto: env COMMERCE_CURRENCY → usd) */
	commerceCurrency: string;
	/** 84: support-card custom copy ('' = built-in message key) */
	supportIntro: string;
	/** about-page featured works (Phase 41; empty array = fall back to pinned + recent posts) */
	works: WorkEntry[];
	/** when works are insufficient, pad to 6 cards with pinned + recent (Phase 42.5; default false = show config only) */
	worksBackfill: boolean;
	/** whether any field has been customized */
	customized: boolean;
}

/** enabled locales (derived from the paraglide runtime — adding/removing in config/locales.json just works; no hardcode drift) */
export const SLOGAN_LOCALES: string[] = [...RUNTIME_LOCALES];

/** factory defaults (match site_tagline in messages/*.json); owner truth lives in DB slogan_<locale> rows */
export const DEFAULT_SLOGANS: Record<string, string> = {
	'zh-tw': '筆記、隨想與小實驗',
	'zh-cn': '笔记、随想与小实验',
	en: 'Notes, essays & small experiments',
	jp: 'メモ、エッセイ、小さな実験'
};

const KEY_UI_THEME = 'ui_theme';
const KEY_WORKS = 'works';
const KEY_WORKS_FILL = 'works_fill';
const KEY_THEME_CONTENT = 'theme_content';
const KEY_SUPPORT_SURF = 'support_surfaces';
const KEY_SLOT_ASSIGN = 'slot_assignments';
const sloganKey = (locale: string) => `slogan_${locale}`;

/** 79-i18n: localizable site identity fields (empty = fall back to site-level monolingual) */
export const IDENTITY_LOCALES = SLOGAN_LOCALES;
const IDENTITY_BASE_KEYS: Record<string, string> = {
	descriptions: 'site_description',
	footers: 'footer_text',
	copyrights: 'copyright_text',
	aboutBodies: 'about_body',
	worksByLocale: 'works'
};
const identityKeys = (locale: string) =>
	Object.values(IDENTITY_BASE_KEYS).map((k) => `${k}_${locale}`);

const ALL_KEYS = [
	...SETTINGS_FIELDS.map((f) => f.key),
	KEY_UI_THEME,
	KEY_THEME_CONTENT,
	KEY_SUPPORT_SURF,
	KEY_SLOT_ASSIGN,
	KEY_WORKS,
	KEY_WORKS_FILL,
	...SLOGAN_LOCALES.map((l) => sloganKey(l)),
	...IDENTITY_LOCALES.flatMap((l) => identityKeys(l))
];

/** theme_content safe parse (invalid/oversize = empty object; depth unlimited but size capped at 64KB) */
export function parseThemeContent(raw: string | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		const v = JSON.parse(raw);
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/** works JSON → cleaned entries (field truncation = site-wide consistent policy) */
function parseWorksRaw(raw: string | undefined): WorkEntry[] {
	try {
		const parsed = JSON.parse(raw ?? '[]');
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((w) => w && typeof w.title === 'string' && typeof w.href === 'string')
			.map((w) => ({
				title: String(w.title).slice(0, 120),
				href: String(w.href).slice(0, 300),
				description: typeof w.description === 'string' ? w.description.slice(0, 300) : undefined,
				badge: typeof w.badge === 'string' ? w.badge.slice(0, 40) : undefined,
				date: typeof w.date === 'string' ? w.date.slice(0, 20) : undefined,
				cover: typeof w.cover === 'string' ? w.cover.slice(0, 300) : undefined
			}));
	} catch {
		return [];
	}
}

export async function getSettings(db: D1Database): Promise<SiteSettings> {
	const kit = getDb(db);
	const rows = await kit
		.select({ key: siteSettings.key, value: siteSettings.value })
		.from(siteSettings)
		.where(
			or(inArray(siteSettings.key, ALL_KEYS), like(siteSettings.key, `${PLUGIN_SETTINGS_PREFIX}%`))
		);

	const map = new Map(rows.map((r) => [r.key, r.value]));
	const slogans: Record<string, string> = {};
	for (const locale of SLOGAN_LOCALES) {
		slogans[locale] = map.get(sloganKey(locale)) ?? DEFAULT_SLOGANS[locale] ?? '';
	}
	const customized = rows.length > 0;
	const rawTheme = map.get(KEY_UI_THEME);

	const works = parseWorksRaw(map.get(KEY_WORKS));
	const descriptions: Record<string, string> = {};
	const footers: Record<string, string> = {};
	const copyrights: Record<string, string> = {};
	const aboutBodies: Record<string, string> = {};
	const worksByLocale: Record<string, WorkEntry[]> = {};
	for (const l of IDENTITY_LOCALES) {
		descriptions[l] = (map.get(`site_description_${l}`) ?? '').trim();
		footers[l] = (map.get(`footer_text_${l}`) ?? '').trim();
		copyrights[l] = (map.get(`copyright_text_${l}`) ?? '').trim();
		aboutBodies[l] = map.get(`about_body_${l}`) ?? '';
		const wl = parseWorksRaw(map.get(`works_${l}`));
		if (wl.length > 0) worksByLocale[l] = wl;
	}

	// P83b: simple scalar props are generated from the field registry
	const simple: Record<string, string> = {};
	for (const f of SETTINGS_FIELDS) {
		let v = map.get(f.key) ?? '';
		if (f.readSlice) v = v.slice(0, f.readSlice);
		simple[f.prop] = v;
	}

	return {
		...(simple as unknown as SiteSettings),
		slogans,
		descriptions,
		footers,
		copyrights,
		aboutBodies,
		worksByLocale,
		themeContent: parseThemeContent(map.get(KEY_THEME_CONTENT)),
		uiTheme: isValidThemeId(rawTheme) ? rawTheme : 'abstract',
		/** 79e-3: support card surfaces (comma list post,support,about; empty = off) */
		supportSurfaces: (map.get(KEY_SUPPORT_SURF) ?? '').slice(0, 64),
		slotAssignments: parseSlotAssignments(map.get(KEY_SLOT_ASSIGN)),
		pluginSettings: splitPluginRows(rows),
		works,
		worksBackfill: map.get(KEY_WORKS_FILL) === '1',
		customized
	};
}

/** localized value: empty = fall back to site-level monolingual (79-i18n semantics, same as the slogan chain) */
export function identityFor(s: SiteSettings, locale: string) {
	return {
		siteDescription: s.descriptions[locale] || s.siteDescription,
		footerText: s.footers[locale] || s.footerText,
		copyright: s.copyrights[locale] || s.copyright,
		aboutBody: (s.aboutBodies[locale] ?? '').trim() ? s.aboutBodies[locale] : s.aboutBody,
		works: s.worksByLocale[locale] ?? s.works
	};
}

/* siteRuntimeOf moved to $lib/site (client-shared); re-export keeps existing server imports working */
import { siteRuntimeOf } from '$lib/site';
export { siteRuntimeOf };

/** update settings (upsert; unknown keys ignored) */
export async function updateSettings(
	db: D1Database,
	patch: {
		logo?: string;
		heroBg?: string;
		defaultOgImage?: string;
		twitterSite?: string;
		name?: string;
		shortName?: string;
		siteDescription?: string;
		authorHandle?: string;
		siteUrl?: string;
		socialsConfig?: string;
		authorName?: string;
		footerText?: string;
		copyright?: string;
		timezone?: string;
		slogans?: Partial<Record<string, string>>;
		descriptions?: Partial<Record<string, string>>;
		footers?: Partial<Record<string, string>>;
		copyrights?: Partial<Record<string, string>>;
		aboutBodies?: Partial<Record<string, string>>;
		worksByLocale?: Partial<Record<string, WorkEntry[]>>;
		/** 78f (B1): raw JSON string (must be an object; >32KB rejected = caller error) */
		themeContent?: string;
		aboutBody?: string;
		uiTheme?: ActiveThemeId;
		agentInstructions?: string;
		supportSurfaces?: string;
		/** P83a: raw JSON (sanitized by parseSlotAssignments before storing) */
		slotAssignments?: string;
		/** P83b: plugin settings (plugin.<id> namespace; values must be JSON objects) */
		pluginSettings?: Record<string, Record<string, unknown>>;
		commerceCurrency?: string;
		supportIntro?: string;
		works?: WorkEntry[];
		worksBackfill?: boolean;
	}
): Promise<void> {
	const kit = getDb(db);
	const now = new Date();
	const entries: Array<[string, string]> = [];

	// P83b: registry-driven simple fields (trim/transform/validate/max per field)
	for (const f of SETTINGS_FIELDS) {
		const v = (patch as Record<string, unknown>)[f.prop];
		if (typeof v !== 'string') continue;
		const cleaned = cleanFieldValue(v, f);
		if (cleaned !== null) entries.push([f.key, cleaned]);
	}
	if (patch.themeContent !== undefined) {
		const raw = patch.themeContent.trim();
		if (raw === '') entries.push([KEY_THEME_CONTENT, '']);
		else if (raw.length <= 32_000) {
			try {
				const v = JSON.parse(raw);
				if (v && typeof v === 'object' && !Array.isArray(v)) entries.push([KEY_THEME_CONTENT, raw]);
			} catch {
				/* invalid JSON = skip that field (the rest proceed) */
			}
		}
	}
	if (patch.uiTheme !== undefined && isValidThemeId(patch.uiTheme))
		entries.push([KEY_UI_THEME, patch.uiTheme]);
	if (patch.supportSurfaces !== undefined) {
		const allow = new Set(['post', 'support', 'about']);
		const cleaned = patch.supportSurfaces
			.split(',')
			.map((x) => x.trim().toLowerCase())
			.filter((x) => allow.has(x));
		const surfaces = [...new Set(cleaned)].join(',');
		entries.push([KEY_SUPPORT_SURF, surfaces]);
		// P83a bridge: keep the built-in support-zone slot defaults in sync with
		// the surfaces toggle (other assignments untouched), unless the caller
		// sets slotAssignments explicitly in the same patch.
		if (patch.slotAssignments === undefined) {
			const row = await kit
				.select({ value: siteSettings.value })
				.from(siteSettings)
				.where(eq(siteSettings.key, KEY_SLOT_ASSIGN))
				.get();
			const merged = mergeSupportAssignments(parseSlotAssignments(row?.value), surfaces);
			entries.push([KEY_SLOT_ASSIGN, JSON.stringify(merged)]);
		}
	}
	if (patch.slotAssignments !== undefined) {
		const cleaned = parseSlotAssignments(patch.slotAssignments.slice(0, 8192));
		entries.push([KEY_SLOT_ASSIGN, JSON.stringify(cleaned)]);
	}
	if (patch.works !== undefined) entries.push([KEY_WORKS, JSON.stringify(patch.works)]);
	if (patch.worksBackfill !== undefined)
		entries.push([KEY_WORKS_FILL, patch.worksBackfill ? '1' : '0']);
	for (const [locale, value] of Object.entries(patch.slogans ?? {})) {
		if (SLOGAN_LOCALES.includes(locale) && value !== undefined) {
			entries.push([sloganKey(locale), value]);
		}
	}
	// 79-i18n: per-locale site identity fields (caps match the site-level fields)
	const caps: Array<[Partial<Record<string, string>> | undefined, string, number]> = [
		[patch.descriptions, 'site_description', 500],
		[patch.footers, 'footer_text', 300],
		[patch.copyrights, 'copyright_text', 200],
		[patch.aboutBodies, 'about_body', 20000]
	];
	for (const [bag, baseKey, cap] of caps) {
		for (const [locale, value] of Object.entries(bag ?? {})) {
			if (IDENTITY_LOCALES.includes(locale) && value !== undefined)
				entries.push([`${baseKey}_${locale}`, value.trim().slice(0, cap)]);
		}
	}
	for (const [locale, list] of Object.entries(patch.worksByLocale ?? {})) {
		if (IDENTITY_LOCALES.includes(locale) && Array.isArray(list))
			entries.push([`works_${locale}`, JSON.stringify(list.slice(0, 12))]);
	}

	if (patch.pluginSettings !== undefined) {
		let budget = 32_768;
		for (const [id, obj] of Object.entries(patch.pluginSettings)) {
			const key = pluginSettingsKey(id);
			if (!key || !obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
			const json = JSON.stringify(obj);
			if (json.length > PLUGIN_SETTINGS_MAX_BYTES || json.length > budget) continue;
			budget -= json.length;
			entries.push([key, json]);
		}
	}

	if (entries.length === 0) return;
	for (const [key, value] of entries) {
		await kit
			.insert(siteSettings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: now } });
	}
}
