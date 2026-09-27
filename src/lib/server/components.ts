/**
 * Workshop custom components — server-side access.
 * names() has a 30s module cache (SSR queries on every render; avoids a D1 hotspot); write endpoints invalidate immediately.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { customComponents, registryItems } from './db/schema';

export interface CustomComponentInfo {
	name: string;
	description: string;
	enabled: boolean;
	aiGenerated: boolean;
	updatedAt: number;
}

const NAME_RE = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED = ['callout', 'youtube', 'post', 'chart', 'timeline', 'gallery', 'card', 'code'];
const CODE_MAX = 40_000;

export function validateComponentFields(fields: { name: string; code: string }): string | null {
	if (!NAME_RE.test(fields.name)) return 'name_invalid（^[a-z][a-z0-9-]{1,30}$，小寫英數連字號）';
	if (RESERVED.includes(fields.name)) return `name_reserved（「${fields.name}」是官方元件）`;
	if (!fields.code.trim()) return 'code_required';
	if (fields.code.length > CODE_MAX) return `code_too_large（上限 ${CODE_MAX} 字元）`;
	if (/<script\s+src=/i.test(fields.code)) return 'no_script_src（不接受外部腳本）';
	return null;
}

export async function listComponents(db: D1Database): Promise<CustomComponentInfo[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			name: customComponents.name,
			description: customComponents.description,
			enabled: customComponents.enabled,
			aiGenerated: customComponents.aiGenerated,
			updatedAt: customComponents.updatedAt
		})
		.from(customComponents);
	return rows.map((r) => ({
		name: r.name,
		description: r.description,
		enabled: r.enabled,
		aiGenerated: r.aiGenerated,
		updatedAt: r.updatedAt?.getTime?.() ?? 0
	}));
}

/** admin-only (Phase 36): Workshop editor reads, bypassing the enabled/review serving gate */
export async function getAdminComponentCode(db: D1Database, name: string): Promise<string | null> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ code: customComponents.code })
		.from(customComponents)
		.where(eq(customComponents.name, name))
		.limit(1);
	return row?.code ?? null;
}

export async function getComponentCode(db: D1Database, name: string): Promise<string | null> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ code: customComponents.code, enabled: customComponents.enabled })
		.from(customComponents)
		.where(eq(customComponents.name, name))
		.limit(1);
	if (!row?.enabled) return null;
	// review gate (Phase 22): components marked pending in the registry aren't served yet
	const [reg] = await kit
		.select({ review: registryItems.review })
		.from(registryItems)
		.where(and(eq(registryItems.kind, 'component'), eq(registryItems.slug, name)))
		.limit(1);
	if (reg && reg.review !== 'approved') return null;
	return row.code;
}

export async function upsertComponent(
	db: D1Database,
	input: { name: string; description?: string; code: string; aiGenerated?: boolean }
): Promise<{ created: boolean }> {
	const kit = getDb(db);
	const exists = (await listComponents(db)).some((c) => c.name === input.name);
	const now = new Date();
	if (exists) {
		await kit
			.update(customComponents)
			.set({
				description: input.description ?? '',
				code: input.code,
				aiGenerated: input.aiGenerated ?? false,
				updatedAt: now
			})
			.where(eq(customComponents.name, input.name));
	} else {
		await kit.insert(customComponents).values({
			name: input.name,
			description: input.description ?? '',
			code: input.code,
			aiGenerated: input.aiGenerated ?? false,
			createdAt: now,
			updatedAt: now
		});
	}
	namesCache = null;
	return { created: !exists };
}

export async function setComponentEnabled(
	db: D1Database,
	name: string,
	enabled: boolean
): Promise<void> {
	const kit = getDb(db);
	await kit
		.update(customComponents)
		.set({ enabled, updatedAt: new Date() })
		.where(eq(customComponents.name, name));
	namesCache = null;
}

export async function deleteComponent(db: D1Database, name: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(customComponents).where(eq(customComponents.name, name));
	namesCache = null;
}

/* ---- for the render pipeline: currently servable custom component names (30s cache) ---- */

let namesCache: { set: Set<string>; at: number } | null = null;
const NAMES_TTL_MS = 30_000;

export async function customComponentNames(db: D1Database): Promise<Set<string>> {
	if (namesCache && Date.now() - namesCache.at < NAMES_TTL_MS) return namesCache.set;
	const kit = getDb(db);
	const rows = await kit
		.select({ name: customComponents.name })
		.from(customComponents)
		.where(eq(customComponents.enabled, true));
	// review gate (Phase 22): registry-pending components aren't servable (AI-generated awaiting approval)
	const pending = await kit
		.select({ slug: registryItems.slug })
		.from(registryItems)
		.where(and(eq(registryItems.kind, 'component'), eq(registryItems.review, 'pending')));
	const blocked = new Set(pending.map((r) => r.slug));
	namesCache = {
		set: new Set(rows.map((r) => r.name).filter((n) => !blocked.has(n))),
		at: Date.now()
	};
	return namesCache.set;
}

/** called by registry write paths: invalidate the name cache immediately (this isolate; cross-isolate converges ≤ TTL) */
export function invalidateNamesCache(): void {
	namesCache = null;
}

/** for load → client preview: convert to array (Sets aren't serializable) */
export async function customComponentNameList(db: D1Database): Promise<string[]> {
	return [...(await customComponentNames(db))];
}

/** extract component source from a model reply (```svelte block preferred; a whole component-looking answer also works) */
export function extractSvelteCode(reply: string): string | null {
	const fence = /```(?:svelte|vue|html)?\s*\n([\s\S]*?)```/.exec(reply);
	const cand = (fence ? fence[1] : reply).trim();
	if (/<script[\s>]/i.test(cand) || /<[^>]+>[\s\S]*<\/[^>]+>/.test(cand)) return cand;
	return null;
}
