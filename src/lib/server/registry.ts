/**
 * Component/Plugin Registry service layer (Phase 22).
 *
 * Unified lifecycle: install → (update→version+) → enable/disable → review → rollback → uninstall.
 * Three artifact kinds:
 *   component  code lives in custom_components (render pipeline unchanged); registry manages versions + review + toggle
 *   plugin     manifest snapshotted into versions.artifact; registry.enabled = the hooks engine's enable gate
 *   theme      directory registration (actual skins are build-time packs; enabled = availability flag)
 *
 * Workers-safe: all db passed per request; no cross-request mutable state (component-name cache stays in components.ts).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { registryItems, registryVersions, customComponents } from './db/schema';
import { invalidateNamesCache } from './components';

export type RegistryKind = 'component' | 'plugin' | 'theme';
export type RegistrySource = 'official' | 'community' | 'github' | 'private' | 'ai';
export type ReviewState = 'approved' | 'pending';

export interface RegistryItem {
	id: string;
	kind: RegistryKind;
	slug: string;
	name: string;
	description: string;
	source: RegistrySource;
	version: number;
	enabled: boolean;
	review: ReviewState;
	capabilities: string[];
	updatedAt: number;
}

export interface RegistryVersion {
	version: number;
	artifact: string;
	note: string;
	createdAt: number;
}

const KINDS: RegistryKind[] = ['component', 'plugin', 'theme'];
const SOURCES: RegistrySource[] = ['official', 'community', 'github', 'private', 'ai'];

function parseCaps(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
	} catch {
		return [];
	}
}

function toDto(row: typeof registryItems.$inferSelect): RegistryItem {
	const caps = parseCaps(row.capabilities);
	return {
		id: row.id,
		kind: row.kind as RegistryKind,
		slug: row.slug,
		name: row.name,
		description: row.description,
		source: row.source as RegistrySource,
		version: row.version,
		enabled: row.enabled,
		review: row.review as ReviewState,
		capabilities: caps,
		updatedAt: Number(row.updatedAt)
	};
}

/* ----------------------------- queries ----------------------------- */

export async function listRegistry(db: D1Database, kind?: RegistryKind): Promise<RegistryItem[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(registryItems)
		.where(kind ? eq(registryItems.kind, kind) : undefined)
		.orderBy(asc(registryItems.kind), desc(registryItems.updatedAt));
	return rows.map(toDto);
}

export async function getRegistryItem(
	db: D1Database,
	kind: RegistryKind,
	slug: string
): Promise<RegistryItem | undefined> {
	const kit = getDb(db);
	const [row] = await kit
		.select()
		.from(registryItems)
		.where(and(eq(registryItems.kind, kind), eq(registryItems.slug, slug)))
		.limit(1);
	return row ? toDto(row) : undefined;
}

/**
 * Servable list (render/boot gate): enabled AND approved.
 * Official components / built-in plugins run without registration (callers union the allowlist) — this returns only "approved & enable-able" items.
 */
export async function serveableSlugs(db: D1Database, kind: RegistryKind): Promise<Set<string>> {
	const kit = getDb(db);
	const rows = await kit
		.select({ slug: registryItems.slug })
		.from(registryItems)
		.where(
			and(
				eq(registryItems.kind, kind),
				eq(registryItems.enabled, true),
				eq(registryItems.review, 'approved')
			)
		);
	return new Set(rows.map((r) => r.slug));
}

/** explicitly disabled plugin ids (hooks engine gate: only registry-marked-disabled are blocked; unregistered = on by default) */
export async function disabledPluginIds(db: D1Database): Promise<Set<string>> {
	const kit = getDb(db);
	const rows = await kit
		.select({ slug: registryItems.slug })
		.from(registryItems)
		.where(and(eq(registryItems.kind, 'plugin'), eq(registryItems.enabled, false)));
	return new Set(rows.map((r) => r.slug));
}

export async function listVersions(db: D1Database, itemId: string): Promise<RegistryVersion[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(registryVersions)
		.where(eq(registryVersions.itemId, itemId))
		.orderBy(desc(registryVersions.version));
	return rows.map((r) => ({
		version: r.version,
		artifact: r.artifact,
		note: r.note,
		createdAt: Number(r.createdAt)
	}));
}

/* --------------------------- lifecycle --------------------------- */

export interface InstallInput {
	kind: RegistryKind;
	slug: string;
	name: string;
	description?: string;
	source?: RegistrySource;
	/** component: .svelte source; plugin/theme: manifest JSON */
	artifact: string;
	capabilities?: string[];
	/** AI sources expected to pend review; everything else approved by default */
	review?: ReviewState;
	note?: string;
}

/** install/update (idempotent by kind+slug; existing item → new version + snapshot) */
export async function installArtifact(
	db: D1Database,
	input: InstallInput
): Promise<{ ok: true; item: RegistryItem; version: number } | { ok: false; error: string }> {
	if (!KINDS.includes(input.kind)) return { ok: false, error: 'kind_invalid' };
	if (!SOURCES.includes(input.source ?? 'private')) return { ok: false, error: 'source_invalid' };
	if (!input.slug?.trim() || !input.artifact?.trim())
		return { ok: false, error: 'slug_and_artifact_required' };

	const source: RegistrySource = input.source ?? 'private';
	const review: ReviewState = input.review ?? (source === 'ai' ? 'pending' : 'approved');
	const kit = getDb(db);
	const now = new Date();
	const caps = JSON.stringify(input.capabilities ?? []);

	const [existing] = await kit
		.select()
		.from(registryItems)
		.where(and(eq(registryItems.kind, input.kind), eq(registryItems.slug, input.slug)))
		.limit(1);

	let itemId: string;
	let nextVersion: number;

	if (existing) {
		nextVersion = existing.version + 1;
		itemId = existing.id;
		await kit
			.update(registryItems)
			.set({
				name: input.name,
				description: input.description ?? existing.description,
				source,
				version: nextVersion,
				review,
				capabilities: caps,
				updatedAt: now
			})
			.where(eq(registryItems.id, existing.id));
	} else {
		nextVersion = 1;
		itemId = crypto.randomUUID();
		await kit.insert(registryItems).values({
			id: itemId,
			kind: input.kind,
			slug: input.slug,
			name: input.name,
			description: input.description ?? '',
			source,
			version: nextVersion,
			enabled: true,
			review,
			capabilities: caps,
			createdAt: now,
			updatedAt: now
		});
	}

	await kit.insert(registryVersions).values({
		id: crypto.randomUUID(),
		itemId,
		version: nextVersion,
		artifact: input.artifact,
		note: input.note ?? (existing ? 'update' : 'install'),
		createdAt: now
	});

	// component: code body synced into custom_components (the render pipeline's source)
	if (input.kind === 'component') invalidateNamesCache();
	if (input.kind === 'component') {
		await kit
			.insert(customComponents)
			.values({
				name: input.slug,
				description: input.description ?? '',
				code: input.artifact,
				enabled: true,
				aiGenerated: source === 'ai',
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: customComponents.name,
				set: {
					description: input.description ?? '',
					code: input.artifact,
					aiGenerated: source === 'ai',
					updatedAt: now
				}
			});
	}

	const item = await getRegistryItem(db, input.kind, input.slug);
	return { ok: true, item: item!, version: nextVersion };
}

/** enable/disable (plugin gate + component servability take effect immediately) */
export async function setEnabled(
	db: D1Database,
	itemId: string,
	enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
	const kit = getDb(db);
	const [row] = await kit.select().from(registryItems).where(eq(registryItems.id, itemId)).limit(1);
	if (!row) return { ok: false, error: 'not_found' };
	const now = new Date();
	await kit
		.update(registryItems)
		.set({ enabled, updatedAt: now })
		.where(eq(registryItems.id, itemId));
	// component disable synced to custom_components (the pipeline queries that table directly)
	if (row.kind === 'component') {
		await kit
			.update(customComponents)
			.set({ enabled, updatedAt: now })
			.where(eq(customComponents.name, row.slug));
		invalidateNamesCache();
	}
	return { ok: true };
}

/** component review-state quick lookup (Phase 36 Workshop badges): slug → review */
export async function listComponentReviewStates(
	db: D1Database
): Promise<Record<string, ReviewState>> {
	const kit = getDb(db);
	const rows = await kit
		.select({ slug: registryItems.slug, review: registryItems.review })
		.from(registryItems)
		.where(eq(registryItems.kind, 'component'));
	const map: Record<string, ReviewState> = {};
	for (const r of rows) map[r.slug] = r.review as ReviewState;
	return map;
}

/** review: approve / send back (send back = pending; component loses servability) */
export async function setReview(
	db: D1Database,
	itemId: string,
	review: ReviewState
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (review !== 'approved' && review !== 'pending') return { ok: false, error: 'review_invalid' };
	const kit = getDb(db);
	const [row] = await kit.select().from(registryItems).where(eq(registryItems.id, itemId)).limit(1);
	if (!row) return { ok: false, error: 'not_found' };
	await kit
		.update(registryItems)
		.set({ review, updatedAt: new Date() })
		.where(eq(registryItems.id, itemId));
	invalidateNamesCache(); // approve/send-back affects component servability immediately
	return { ok: true };
}

/** rollback: re-apply a historic version's artifact as a "new version" (non-destructive roll-forward) */
export async function rollbackTo(
	db: D1Database,
	itemId: string,
	targetVersion: number
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
	const kit = getDb(db);
	const [item] = await kit
		.select()
		.from(registryItems)
		.where(eq(registryItems.id, itemId))
		.limit(1);
	if (!item) return { ok: false, error: 'not_found' };
	const [snap] = await kit
		.select()
		.from(registryVersions)
		.where(and(eq(registryVersions.itemId, itemId), eq(registryVersions.version, targetVersion)))
		.limit(1);
	if (!snap) return { ok: false, error: 'version_not_found' };
	const r = await installArtifact(db, {
		kind: item.kind as RegistryKind,
		slug: item.slug,
		name: item.name,
		description: item.description,
		source: item.source as RegistrySource,
		artifact: snap.artifact,
		capabilities: JSON.parse(item.capabilities || '[]') as string[],
		review: 'approved',
		note: `回滾至 v${targetVersion}`
	});
	return r.ok ? { ok: true, version: r.version } : r;
}

/** uninstall: cascade-deletes version snapshots; components also clear custom_components */
export async function uninstall(
	db: D1Database,
	itemId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
	const kit = getDb(db);
	const [item] = await kit
		.select()
		.from(registryItems)
		.where(eq(registryItems.id, itemId))
		.limit(1);
	if (!item) return { ok: false, error: 'not_found' };
	if (item.kind === 'component') {
		await kit.delete(customComponents).where(eq(customComponents.name, item.slug));
		invalidateNamesCache();
	}
	await kit.delete(registryItems).where(eq(registryItems.id, itemId));
	return { ok: true };
}
