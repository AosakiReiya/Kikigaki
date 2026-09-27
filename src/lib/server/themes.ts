/**
 * Phase 78c — DB themes (git-free reskinning + foundation for AI-generated themes).
 * id is always `db-` prefix + slug (never collides with built-in THEME_IDS; prevents lockout);
 * surfaces = JSON `{ [surface]: { code, css? } }` (Workshop compile format); the renderer
 * ($lib/themes/db-registry) layers it over the base pack (SSR falling back to the base layout = honest degradation).
 * Syntax trial-compile gates on the editor side (c2); the server guards shape/size/allowlists (no compiler dependency).
 */
import { asc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { themes } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';
import { DB_THEME_SLUG_RE, isDbThemeId, isThemeId, type DbThemeBehaviors } from '$lib/themes';
import { validateBehaviors } from '$lib/themes';
export { validateBehaviors };
import { THEME_SURFACES, type ThemeSurface } from '$lib/themes/contracts';

const SLUG_RE = DB_THEME_SLUG_RE;
export const DB_THEME_PREFIX = 'db-';

export interface DbThemeSurface {
	code: string;
	css?: string;
}
export type DbThemeSurfaces = Partial<Record<ThemeSurface, DbThemeSurface>>;

export interface ThemeRecord {
	id: string;
	label: string;
	description: string;
	tokensCss: string;
	surfaces: DbThemeSurfaces;
	behaviors: DbThemeBehaviors;
	base: string;
	version: number;
	enabled: boolean;
	updatedAt: number;
}

/** size gate (ample headroom under the D1 statement limit; Workshop components are far smaller in practice)*/
const LIMITS = {
	label: 64,
	description: 200,
	tokensCss: 40_000,
	code: 80_000,
	css: 40_000,
	total: 400_000
};

export { isDbThemeId };

/** Neutralize `</style>` breakout before SSR-inlining admin-authored tokens CSS.
 * Tokens live in the single-admin trust model (same as surfaces); this only guards
 * the SSR HTML structure, not content policy. */
export function sanitizeTokensForSsr(css: string): string {
	return css
		.replace(/<\/style/gi, '<\\/style')
		.replace(/<!--/g, '<\\!--')
		.slice(0, 40_000);
}

/** 建立用 id 生成（slug 白名單＋保留字守） */
export function makeThemeId(slug: string): string | null {
	const s = slug.trim().toLowerCase();
	if (!SLUG_RE.test(s)) return null;
	return DB_THEME_PREFIX + s;
}

export function validateSurfaces(raw: unknown): {
	ok: boolean;
	error?: string;
	value?: DbThemeSurfaces;
} {
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return { ok: false, error: 'surfaces 不是合法 JSON' };
		}
	}
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
		return { ok: false, error: 'surfaces 需為物件' };
	const out: DbThemeSurfaces = {};
	let total = 0;
	for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
		if (!(THEME_SURFACES as readonly string[]).includes(k))
			return { ok: false, error: `未知 surface：${k}` };
		const surface = k as ThemeSurface;
		if (typeof v !== 'object' || v === null) return { ok: false, error: `${surface} 需為物件` };
		const { code, css } = v as { code?: unknown; css?: unknown };
		if (typeof code !== 'string' || !code.trim())
			return { ok: false, error: `${surface}.code 必填` };
		if (code.length > LIMITS.code)
			return { ok: false, error: `${surface}.code 過大（>${LIMITS.code}）` };
		if (css !== undefined && (typeof css !== 'string' || css.length > LIMITS.css))
			return { ok: false, error: `${surface}.css 過大或非字串` };
		total += code.length + (typeof css === 'string' ? css.length : 0);
		out[surface] = { code, css: typeof css === 'string' ? css : undefined };
	}
	if (total > LIMITS.total) return { ok: false, error: `surfaces 總量過大（>${LIMITS.total}）` };
	return { ok: true, value: out };
}

export interface ThemeInput {
	id: string;
	label: string;
	description?: string;
	tokensCss?: string;
	surfaces?: unknown;
	behaviors?: unknown;
	base?: string;
	enabled?: boolean;
}

/** 完整入帳校驗（saveTheme 前置；回傳規範化值或錯誤清單） */
export function validateTheme(input: ThemeInput): {
	ok: boolean;
	errors: string[];
	value?: ThemeInput;
} {
	const errors: string[] = [];
	if (!isDbThemeId(input.id)) errors.push('id 需為 db- 前綴＋小寫 slug（a-z0-9-，2-32 字）');
	if (!input.label?.trim() || input.label.length > LIMITS.label)
		errors.push(`label 必填且 ≤${LIMITS.label}`);
	if ((input.description ?? '').length > LIMITS.description) errors.push('description 過長');
	if ((input.tokensCss ?? '').length > LIMITS.tokensCss) errors.push('tokens_css 過長');
	if (input.base !== undefined && !isThemeId(input.base)) errors.push('base 需為內建主題 id');
	const sv = validateSurfaces(input.surfaces ?? {});
	if (!sv.ok) errors.push(sv.error ?? 'surfaces 非法');
	const bv = validateBehaviors(input.behaviors ?? '');
	if (!bv.ok) errors.push(bv.error ?? 'behaviors 非法');
	if (!errors.length)
		return { ok: true, errors: [], value: { ...input, surfaces: sv.value, behaviors: bv.value } };
	return { ok: false, errors };
}

function rowToRecord(r: typeof themes.$inferSelect): ThemeRecord {
	const parsed = validateSurfaces(r.surfaces);
	const bv = validateBehaviors(r.behaviors);
	return {
		id: r.id,
		label: r.label,
		description: r.description,
		tokensCss: r.tokensCss,
		surfaces: parsed.ok ? (parsed.value as DbThemeSurfaces) : {},
		behaviors: bv.ok ? (bv.value as DbThemeBehaviors) : {},
		base: r.base,
		version: r.version,
		enabled: r.enabled === 1,
		updatedAt: r.updatedAt.getTime()
	};
}

export async function listThemes(db: D1Database): Promise<ThemeRecord[]> {
	const rows = await getDb(db).select().from(themes).orderBy(asc(themes.id));
	return rows.map(rowToRecord);
}

export async function getTheme(db: D1Database, id: string): Promise<ThemeRecord | null> {
	if (!isDbThemeId(id)) return null;
	const rows = await getDb(db).select().from(themes).where(eq(themes.id, id));
	return rows[0] ? rowToRecord(rows[0]) : null;
}

/** 建立/更新（version 單調 +1；enabled 僅 DB 行有值） */
export async function saveTheme(
	db: D1Database,
	input: ThemeInput
): Promise<{ ok: true; record: ThemeRecord } | { ok: false; errors: string[] }> {
	const v = validateTheme(input);
	if (!v.ok) return { ok: false, errors: v.errors };
	const i = v.value as ThemeInput & { surfaces: DbThemeSurfaces };
	const now = new Date();
	const existing = await getTheme(db, i.id);
	const next = {
		label: i.label.trim(),
		description: (i.description ?? '').trim(),
		tokensCss: i.tokensCss ?? existing?.tokensCss ?? '',
		surfaces: JSON.stringify(i.surfaces),
		behaviors:
			i.behaviors !== undefined
				? JSON.stringify(i.behaviors)
				: JSON.stringify(existing?.behaviors ?? {}),
		base: i.base ?? existing?.base ?? 'abstract',
		enabled: (i.enabled ?? existing?.enabled ?? true) ? 1 : 0,
		version: (existing?.version ?? 0) + 1,
		updatedAt: now
	};
	const q = getDb(db);
	if (existing) await q.update(themes).set(next).where(eq(themes.id, i.id));
	else await q.insert(themes).values({ id: i.id, createdAt: now, ...next });
	const record = await getTheme(db, i.id);
	return record ? { ok: true, record } : { ok: false, errors: ['寫入後讀取失敗'] };
}

export async function deleteTheme(db: D1Database, id: string): Promise<boolean> {
	if (!isDbThemeId(id)) return false;
	const r = await getDb(db).delete(themes).where(eq(themes.id, id));
	return (r as unknown as { meta?: { changes?: number } }).meta?.changes === 1;
}
