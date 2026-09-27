/**
 * Server-side plugin boot (Phase 22) — "registers" built-in plugins into the registry (idempotent)
 * and drives the hooks engine gate from registry enable states (DB + 30s cache, Workers-safe).
 *
 * Call `bootPlugins(db)` once at the start of handle; cached within the isolate, never rewritten per request.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { setPluginGate } from './hooks';
import { BUILTIN_PLUGINS } from './index';
import { getRegistryItem, installArtifact, disabledPluginIds } from '$lib/server/registry';

let seeded = false;
let disabledCache: { set: Set<string>; at: number } | null = null;
const TTL = 30_000;

/* * idempotently register built-in plugins (write only when missing; existing rows keep their version); once per isolate */
async function ensureSeeded(db: D1Database): Promise<void> {
	if (seeded) return;
	for (const p of BUILTIN_PLUGINS) {
		try {
			const existing = await getRegistryItem(db, 'plugin', p.manifest.id);
			if (!existing) {
				await installArtifact(db, {
					kind: 'plugin',
					slug: p.manifest.id,
					name: p.manifest.name,
					description: p.manifest.description,
					source: 'official',
					artifact: JSON.stringify(p.manifest),
					capabilities: p.manifest.capabilities ?? []
				});
			}
		} catch (err) {
			console.error('[plugins] seed failed (non-fatal):', err);
		}
	}
	seeded = true;
}

export async function bootPlugins(db: D1Database | undefined): Promise<void> {
	if (db) {
		try {
			await ensureSeeded(db);
		} catch (err) {
			console.error('[plugins] boot seed error:', err);
		}
	}
	// the gate installs once (self-caching inside; unreadable DB = pass through — availability first)
	setPluginGate(async (id) => {
		if (!db) return false;
		if (!disabledCache || Date.now() - disabledCache.at > TTL) {
			try {
				disabledCache = { set: await disabledPluginIds(db), at: Date.now() };
			} catch {
				disabledCache = { set: new Set(), at: Date.now() };
			}
		}
		return disabledCache.set.has(id);
	});
}

/* * called by registry write endpoints so disable/enable take effect instantly (no TTL wait) */
export function invalidatePluginGate(): void {
	disabledCache = null;
}
