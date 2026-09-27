/**
 * P83b — Settings field registry: the single source of truth for simple
 * scalar site settings. `settings.ts` derives its key whitelist (ALL_KEYS),
 * read-mapping and write-sanitizing from this table, so adding a field is a
 * one-row change instead of three hand-synced edits (the missing-ALL_KEYS
 * bug class hit us once in 79e-3).
 *
 * Complex fields stay hand-written in settings.ts on purpose: ui_theme
 * (theme-id validation), theme_content (JSON gate), works/works_fill
 * (structured JSON), support_surfaces (slot bridge), slot_assignments
 * (sanitizer), slogan/identity locale families (derived keys).
 *
 * Plugin settings live under the reserved `plugin.<id>` key namespace
 * (one JSON object row per plugin) — see pluginSettingsKey/splitPluginRows.
 */

export type SettingsFieldType = 'text' | 'textarea';

export interface SettingsField {
	/** DB key in site_settings */
	key: string;
	/** SiteSettings property name */
	prop: string;
	type: SettingsFieldType;
	/** Admin label (zh-Hant; UI copy convention) */
	label: string;
	group: 'identity' | 'seo' | 'appearance' | 'about' | 'agent' | 'commerce';
	/** Trim before store */
	trim?: boolean;
	/** Max stored length (write side) */
	max?: number;
	/** Extra read-side clamp (legacy agentInstructions behavior) */
	readSlice?: number;
	/** Value rewrite (e.g. handle normalization); runs after trim */
	transform?: (v: string) => string;
	/** Reject write when false (field silently skipped, others still saved) */
	validate?: (v: string) => boolean;
}

export const SETTINGS_FIELDS: SettingsField[] = [
	{ key: 'logo', prop: 'logo', type: 'text', label: 'Logo 圖片鍵', group: 'identity' },
	{ key: 'hero_bg', prop: 'heroBg', type: 'text', label: 'Hero 背景鍵', group: 'appearance' },
	{ key: 'seo_og_image', prop: 'defaultOgImage', type: 'text', label: '預設 OG 圖', group: 'seo' },
	{
		key: 'seo_twitter_site',
		prop: 'twitterSite',
		type: 'text',
		label: 'X (Twitter) 帳號',
		group: 'seo',
		transform: (v) => (v.trim() === '' ? '' : '@' + v.trim().replace(/^@+/, ''))
	},
	{
		key: 'site_name',
		prop: 'name',
		type: 'text',
		label: '站名',
		group: 'identity',
		trim: true,
		max: 80
	},
	{
		key: 'site_short_name',
		prop: 'shortName',
		type: 'text',
		label: '短站名',
		group: 'identity',
		trim: true,
		max: 40
	},
	{
		key: 'site_description',
		prop: 'siteDescription',
		type: 'textarea',
		label: '站描述',
		group: 'identity',
		trim: true,
		max: 500
	},
	{
		key: 'author_name',
		prop: 'authorName',
		type: 'text',
		label: '作者名',
		group: 'identity',
		trim: true,
		max: 80
	},
	{
		key: 'author_handle',
		prop: 'authorHandle',
		type: 'text',
		label: '作者 handle',
		group: 'identity',
		trim: true,
		max: 40,
		transform: (v) => v.replace(/^@/, '')
	},
	{
		key: 'site_url',
		prop: 'siteUrl',
		type: 'text',
		label: '站 URL（canonical）',
		group: 'seo',
		transform: (v) => v.trim().replace(/\/+$/, ''),
		// invalid = skip this field (protects canonical); empty clears
		validate: (v) => v === '' || /^https:\/\/[-\w.]+(:\d+)?$/.test(v)
	},
	{
		key: 'footer_text',
		prop: 'footerText',
		type: 'text',
		label: '頁尾文字',
		group: 'appearance',
		trim: true,
		max: 300
	},
	{
		key: 'copyright_text',
		prop: 'copyright',
		type: 'text',
		label: '版權列',
		group: 'appearance',
		trim: true,
		max: 200
	},
	{
		key: 'site_timezone',
		prop: 'timezone',
		type: 'text',
		label: '時區',
		group: 'appearance',
		trim: true,
		validate: (v) => /^[\w/+]{2,40}$/.test(v)
	},
	{
		key: 'socials_config',
		prop: 'socialsConfig',
		type: 'textarea',
		label: '社群連結 JSON',
		group: 'identity',
		max: 4000
	},
	{ key: 'about_body', prop: 'aboutBody', type: 'textarea', label: '關於頁內文', group: 'about' },
	{
		key: 'agent_instructions',
		prop: 'agentInstructions',
		type: 'textarea',
		label: 'Agent 指令',
		group: 'agent',
		max: 4000,
		readSlice: 4000
	},
	{
		key: 'commerce_currency',
		prop: 'commerceCurrency',
		type: 'text',
		label: '商店幣別',
		group: 'commerce',
		transform: (v) => v.trim().toLowerCase(),
		// empty = auto (env COMMERCE_CURRENCY / usd); anything else must be a supported code
		validate: (v) =>
			v === '' || ['usd', 'twd', 'jpy', 'hkd', 'cny', 'eur', 'gbp', 'sgd'].includes(v)
	},
	{
		key: 'support_intro',
		prop: 'supportIntro',
		type: 'textarea',
		label: '贊助卡自訂文案',
		group: 'commerce',
		max: 300
	}
];

/** Write-side sanitizer shared by updateSettings (null = reject the field). */
export function cleanFieldValue(raw: string, f: SettingsField): string | null {
	let v = f.trim ? raw.trim() : raw;
	if (f.transform) v = f.transform(v);
	if (f.validate && !f.validate(v)) return null;
	if (f.max !== undefined) v = v.slice(0, f.max);
	return v;
}

/* ------------------------------------------------------------------ plugin */

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,39}$/;
export const PLUGIN_SETTINGS_PREFIX = 'plugin.';
export const PLUGIN_SETTINGS_MAX_BYTES = 8192;

export function pluginSettingsKey(id: string): string | null {
	return PLUGIN_ID_RE.test(id) ? `${PLUGIN_SETTINGS_PREFIX}${id}` : null;
}

/**
 * Split `plugin.*` rows into { pluginId: settingsObject }. Malformed ids or
 * non-object JSON are dropped (fail-silent, same posture as slot assignments).
 */
export function splitPluginRows(
	rows: Array<{ key: string; value: string }>
): Record<string, Record<string, unknown>> {
	const out: Record<string, Record<string, unknown>> = {};
	for (const r of rows) {
		if (!r.key.startsWith(PLUGIN_SETTINGS_PREFIX)) continue;
		const id = r.key.slice(PLUGIN_SETTINGS_PREFIX.length);
		if (!PLUGIN_ID_RE.test(id)) continue;
		try {
			const v: unknown = JSON.parse(r.value);
			if (v && typeof v === 'object' && !Array.isArray(v)) out[id] = v as Record<string, unknown>;
		} catch {
			/* drop */
		}
	}
	return out;
}
