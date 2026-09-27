/**
 * Phase 78c P2 — persistent cache for compiled DB-theme surfaces.
 * Keyed by theme id + surface + source hash; a hit skips downloading and running
 * svelte/compiler entirely (instantiate() of the stored body is synchronous and cheap).
 * Entries are self-verifying (hash mismatch = miss), stale rows are overwritten on the
 * next successful compile; explicit purge happens when a theme is deleted/invalidated.
 * Failures (private mode, quota) degrade silently to the uncached path.
 */
const DB_NAME = 'kikigaki-theme-cache';
const STORE = 'artifacts';

export interface CacheArtifact {
	key: string;
	hash: string;
	body: string;
	css: string;
}

export function artifactKey(themeId: string, surface: string): string {
	return `${themeId}:${surface}`;
}

/** FNV-1a 32bit — sufficient for cache invalidation, stable across runs */
export function hashSource(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16);
}

function openDb(): Promise<IDBDatabase | null> {
	return new Promise((resolve) => {
		try {
			if (typeof indexedDB === 'undefined') return resolve(null);
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				req.result.createObjectStore(STORE, { keyPath: 'key' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null);
			req.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

export async function getCachedArtifact(key: string): Promise<CacheArtifact | null> {
	const db = await openDb();
	if (!db) return null;
	return new Promise((resolve) => {
		try {
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).get(key);
			req.onsuccess = () => resolve((req.result as CacheArtifact) ?? null);
			req.onerror = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
}

export async function putCachedArtifact(a: CacheArtifact): Promise<void> {
	const db = await openDb();
	if (!db) return;
	try {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(a);
	} catch {
		/* best-effort */
	}
}

/** Remove all artifacts belonging to a theme (prefix `<themeId>:`) */
export async function purgeThemeArtifacts(themeId: string): Promise<void> {
	const db = await openDb();
	if (!db) return;
	try {
		const tx = db.transaction(STORE, 'readwrite');
		const store = tx.objectStore(STORE);
		const prefix = IDBKeyRange.bound(`${themeId}:`, `${themeId}:\uffff`);
		store.delete(prefix);
	} catch {
		/* best-effort */
	}
}

/** debug/diagnostics counters (read by e2e; harmless in production) */
export const cacheCounters = { hits: 0, misses: 0, stores: 0 };
if (typeof window !== 'undefined') {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(window as any).__kikigakiThemeCache = cacheCounters;
}
