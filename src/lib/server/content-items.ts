/**
 * Phase 79b — dynamic content types: validation + CRUD over content_items.
 *
 * Types are DB manifests (`content_types.fields` JSON); items store one base-
 * language JSON blob each (per-item i18n is a documented backlog gap). All
 * writes funnel through validateData() — the admin form is a convenience,
 * the validator is the contract (79c's agent tool will reuse it verbatim).
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { emit } from '$lib/plugins/hooks';
import { contentItems, contentTypes, pages } from './db/schema';
import { THEME_ROUTE_SLUGS } from './pages';
import { locales } from '$lib/paraglide/runtime';
import type { D1Database } from '@cloudflare/workers-types';
import type { ContentTypeField, ContentFieldKind } from './content-types/types';

/** caps mirror the settings/theme_content discipline (write gate + read guard) */
const DATA_CAP = 64 * 1024;
const FIELDS_CAP = 32 * 1024;
const KEY_RE = /^[a-z][a-z0-9-]{1,30}$/;
/** built-in registry keys + theme route prefixes a dynamic type may never take */
const RESERVED_KEYS = new Set(['posts', 'pages', 'series']);
/** 79d: dynamic type keys become public paths /key/… — top-level route segments / static assets / locale prefixes are all reserved */
export const RESERVED_TYPE_KEYS = new Set<string>([
	...THEME_ROUTE_SLUGS, // services/contact/press/sections/contents/columns
	'blog',
	'series',
	'search',
	'about',
	'subscribe',
	'media',
	'admin',
	'dev',
	'api',
	'tags',
	'rss.xml',
	'series.rss.xml',
	'sitemap.xml',
	'robots.txt'
]);
/** pure function: does the type key collide with static reservations (route segments/locales/built-in keys) */
export function isReservedTypeKey(key: string): boolean {
	return (
		RESERVED_KEYS.has(key) ||
		RESERVED_TYPE_KEYS.has(key) ||
		(locales as readonly string[]).includes(key)
	);
}

export interface DynamicTypeRow {
	key: string;
	label: string;
	titleField: string;
	enabled: boolean;
	fieldsRaw: string;
}

function mapType(r: typeof contentTypes.$inferSelect): DynamicTypeRow {
	return {
		key: r.key,
		label: r.label,
		titleField: r.titleField,
		enabled: r.enabled === 1,
		fieldsRaw: r.fields
	};
}

/** fields JSON → typed list + structural errors (never throws) */
export function parseFields(rawJson: string): { fields: ContentTypeField[]; errors: string[] } {
	const errors: string[] = [];
	if (rawJson.length > FIELDS_CAP) return { fields: [], errors: ['fields JSON 超過 32KB'] };
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return { fields: [], errors: ['fields 不是合法 JSON'] };
	}
	if (!Array.isArray(parsed)) return { fields: [], errors: ['fields 必須是陣列'] };
	const KINDS = new Set<string>([
		'text',
		'markdown',
		'media',
		'repeater',
		'boolean',
		'date',
		'select'
	]);
	const out: ContentTypeField[] = [];
	const keys = new Set<string>();
	for (const raw of parsed) {
		if (!raw || typeof raw !== 'object') {
			errors.push('欄位條目必須是物件');
			continue;
		}
		const f = raw as Record<string, unknown>;
		const key = typeof f.key === 'string' ? f.key.trim() : '';
		const kind = typeof f.kind === 'string' ? f.kind : '';
		if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) {
			errors.push(`欄位 key 非法：${JSON.stringify(f.key)}`);
			continue;
		}
		if (keys.has(key)) {
			errors.push(`欄位 key 重複：${key}`);
			continue;
		}
		if (!KINDS.has(kind)) {
			errors.push(`欄位 ${key}：未知 kind ${JSON.stringify(f.kind)}`);
			continue;
		}
		keys.add(key);
		out.push({
			key,
			kind: kind as ContentFieldKind,
			required: f.required === true,
			max:
				typeof f.max === 'number' && Number.isInteger(f.max) && f.max > 0
					? Math.min(f.max, 200_000)
					: undefined,
			localized: f.localized === true,
			...(Array.isArray(f.options)
				? { options: (f.options as unknown[]).filter((o) => typeof o === 'string').slice(0, 50) }
				: {})
		});
	}
	return { fields: out, errors };
}

/** one item's data against the type's fields → human-readable error list */
export function validateData(fields: ContentTypeField[], data: Record<string, unknown>): string[] {
	const errs: string[] = [];
	const known = new Set(fields.map((f) => f.key));
	for (const k of Object.keys(data)) {
		if (!known.has(k)) errs.push(`未知欄位：${k}`);
	}
	for (const f of fields) {
		const v = data[f.key];
		const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
		if (f.required && empty) {
			errs.push(`${f.key}：必填`);
			continue;
		}
		if (empty) continue;
		switch (f.kind) {
			case 'text':
			case 'markdown':
				if (typeof v !== 'string') errs.push(`${f.key}：需字串`);
				else if (f.max && [...v].length > f.max) errs.push(`${f.key}：超過 ${f.max} 字`);
				break;
			case 'media':
				if (typeof v !== 'string') errs.push(`${f.key}：需 URL 字串`);
				else if (!/^(https?:\/\/|\/)/.test(v)) errs.push(`${f.key}：需 http(s) 或站內路徑`);
				break;
			case 'boolean':
				if (typeof v !== 'boolean') errs.push(`${f.key}：需布林`);
				break;
			case 'date':
				if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v))
					errs.push(`${f.key}：需 ISO 日期`);
				break;
			case 'select':
				if (typeof v !== 'string') errs.push(`${f.key}：需字串`);
				else if (f.options?.length && !f.options.includes(v)) errs.push(`${f.key}：不在選項內`);
				break;
			case 'repeater':
				if (!Array.isArray(v)) errs.push(`${f.key}：需陣列`);
				else if (v.length > 50) errs.push(`${f.key}：最多 50 項`);
				else if (!v.every((x) => typeof x === 'string' && x.length <= 2000))
					errs.push(`${f.key}：項需 ≤2000 字字串`);
				break;
		}
	}
	return errs;
}

/** slug normalisation: trim, forbid path chars; CJK allowed (site convention) */
export function normalizeSlug(input: string): string | null {
	const s = input.trim().toLowerCase().replaceAll(/\s+/g, '-');
	if (!s || s.length > 60 || s.includes('/') || s.includes('\\')) return null;
	if (!/^[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff_-]*$/.test(s)) return null;
	return s;
}

/* ------------------------------------------------------------------ types */

export async function listTypes(db: D1Database): Promise<DynamicTypeRow[]> {
	const rows = await getDb(db).select().from(contentTypes).orderBy(asc(contentTypes.key)).all();
	return rows.map(mapType);
}

export async function getType(db: D1Database, key: string): Promise<DynamicTypeRow | undefined> {
	const row = await getDb(db).select().from(contentTypes).where(eq(contentTypes.key, key)).get();
	return row ? mapType(row) : undefined;
}

/** create-or-update a type manifest; rejects invalid manifests/collisions */
export async function upsertType(
	db: D1Database,
	input: { key: string; label: string; fieldsJson: string; titleField?: string; enabled?: boolean }
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
	const errors: string[] = [];
	if (!KEY_RE.test(input.key)) errors.push('key：^[a-z][a-z0-9-]{1,30}$');
	if (isReservedTypeKey(input.key)) errors.push(`key 保留（撞路由/語系/內建）：${input.key}`);
	// published custom-page slugs would also be shadowed by /key — blocked at creation too
	if (!errors.length) {
		const clashPage = await getDb(db)
			.select({ slug: pages.slug })
			.from(pages)
			.where(and(eq(pages.slug, input.key), eq(pages.published, true)))
			.get();
		if (clashPage) errors.push(`key 撞已發布頁面：/${input.key}`);
	}
	const label = input.label.trim();
	if (!label || label.length > 60) errors.push('label 需 1–60 字');
	const { fields, errors: fieldErrors } = parseFields(input.fieldsJson);
	errors.push(...fieldErrors);
	if (fields.length === 0) errors.push('至少一個合法欄位');
	const titleField = (input.titleField ?? 'title').trim() || 'title';
	if (errors.length === 0 && !fields.some((f) => f.key === titleField))
		errors.push(`titleField「${titleField}」不在欄位清單`);
	if (errors.length) return { ok: false, errors };
	const now = new Date();
	const kit = getDb(db);
	const existing = await kit
		.select({ id: contentTypes.key })
		.from(contentTypes)
		.where(eq(contentTypes.key, input.key))
		.get();
	const common = {
		label,
		fields: JSON.stringify(fields), // store normalised (caps/enums cleaned)
		titleField,
		enabled: input.enabled === false ? 0 : 1,
		updatedAt: now
	};
	if (existing) {
		await kit.update(contentTypes).set(common).where(eq(contentTypes.key, input.key)).run();
	} else {
		await kit
			.insert(contentTypes)
			.values({ key: input.key, createdAt: now, ...common })
			.run();
		void emit('type:created', { key: input.key, label }, { db }).catch(() => {});
	}
	return { ok: true };
}

export async function deleteType(db: D1Database, key: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(contentItems).where(eq(contentItems.typeKey, key)).run();
	await kit.delete(contentTypes).where(eq(contentTypes.key, key)).run();
}

/* ------------------------------------------------------------------ items */

export interface ContentItemRow {
	id: string;
	typeKey: string;
	slug: string;
	published: boolean;
	sortOrder: number;
	data: Record<string, unknown>;
	updatedAt: number;
}

function mapItem(r: typeof contentItems.$inferSelect): ContentItemRow {
	let data: Record<string, unknown> = {};
	try {
		const p = JSON.parse(r.data);
		if (p && typeof p === 'object' && !Array.isArray(p)) data = p;
	} catch {
		/* corrupt row surfaces as empty (editor will re-save) */
	}
	return {
		id: r.id,
		typeKey: r.typeKey,
		slug: r.slug,
		published: r.published === 1,
		sortOrder: r.sortOrder,
		data,
		updatedAt:
			(r.updatedAt as unknown as Date) instanceof Date
				? (r.updatedAt as unknown as Date).getTime()
				: Number(r.updatedAt)
	};
}

export async function listItems(
	db: D1Database,
	typeKey: string,
	opts: { limit?: number; offset?: number; publishedOnly?: boolean } = {}
): Promise<{ items: ContentItemRow[]; total: number }> {
	const kit = getDb(db);
	const where = opts.publishedOnly
		? and(eq(contentItems.typeKey, typeKey), eq(contentItems.published, 1))
		: eq(contentItems.typeKey, typeKey);
	const [rows, countRow] = await Promise.all([
		kit
			.select()
			.from(contentItems)
			.where(where)
			.orderBy(asc(contentItems.sortOrder), desc(contentItems.updatedAt))
			.limit(opts.limit ?? 50)
			.offset(opts.offset ?? 0)
			.all(),
		kit
			.select({ c: sql<number>`COUNT(*)` })
			.from(contentItems)
			.where(where)
			.get()
	]);
	return { items: rows.map(mapItem), total: Number(countRow?.c ?? 0) };
}

export async function getItem(
	db: D1Database,
	typeKey: string,
	slug: string
): Promise<ContentItemRow | undefined> {
	const row = await getDb(db)
		.select()
		.from(contentItems)
		.where(and(eq(contentItems.typeKey, typeKey), eq(contentItems.slug, slug)))
		.get();
	return row ? mapItem(row) : undefined;
}

export async function upsertItem(
	db: D1Database,
	typeKey: string,
	input: { id?: string; slug: string; dataJson: string; published?: boolean; sortOrder?: number }
): Promise<{ ok: true; slug: string } | { ok: false; errors: string[] }> {
	const type = await getType(db, typeKey);
	if (!type) return { ok: false, errors: [`型別不存在：${typeKey}`] };
	if (input.dataJson.length > DATA_CAP) return { ok: false, errors: ['data 超過 64KB'] };
	let data: Record<string, unknown>;
	try {
		const p = JSON.parse(input.dataJson);
		if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('not object');
		data = p;
	} catch {
		return { ok: false, errors: ['data 不是合法 JSON 物件'] };
	}
	const { fields } = parseFields(type.fieldsRaw);
	const errors = validateData(fields, data);
	const slug = normalizeSlug(input.slug);
	if (!slug) {
		errors.push('slug 非法（1–60 字，無斜線，英數或中文起頭）');
		return { ok: false, errors };
	}
	if (errors.length) return { ok: false, errors };

	const kit = getDb(db);
	const clash = await kit
		.select({ id: contentItems.id })
		.from(contentItems)
		.where(and(eq(contentItems.typeKey, typeKey), eq(contentItems.slug, slug)))
		.get()
		.then((r) => (r && r.id !== (input.id ?? '') ? r.id : null))
		.catch(() => null);
	if (clash) return { ok: false, errors: [`slug 已存在：${slug}`] };

	const now = new Date();
	if (input.id) {
		const row = await kit
			.select({ id: contentItems.id, published: contentItems.published })
			.from(contentItems)
			.where(eq(contentItems.id, input.id))
			.get();
		if (!row || row.id !== input.id) return { ok: false, errors: ['條目不存在'] };
		await kit
			.update(contentItems)
			.set({
				slug,
				data: JSON.stringify(data),
				published: input.published ? 1 : 0,
				sortOrder: input.sortOrder ?? 0,
				updatedAt: now
			})
			.where(eq(contentItems.id, input.id))
			.run();
		if (input.published && !row.published)
			void emit('item:published', { typeKey, slug }, { db }).catch(() => {});
	} else {
		await kit
			.insert(contentItems)
			.values({
				id: crypto.randomUUID(),
				typeKey,
				slug,
				data: JSON.stringify(data),
				published: input.published ? 1 : 0,
				sortOrder: input.sortOrder ?? 0,
				createdAt: now,
				updatedAt: now
			})
			.run();
		if (input.published) void emit('item:published', { typeKey, slug }, { db }).catch(() => {});
	}
	return { ok: true, slug };
}

export async function deleteItem(db: D1Database, id: string): Promise<void> {
	await getDb(db).delete(contentItems).where(eq(contentItems.id, id)).run();
}
