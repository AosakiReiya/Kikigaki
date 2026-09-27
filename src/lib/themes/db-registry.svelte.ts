/**
 * Phase 78c — DB theme resolution chain (client side).
 * /api/themes → per-surface Workshop compile → layered over the base pack ($state reactive).
 * SSR / first frame uncompiled = fall back to the base layout (honest degradation, same pattern as custom components);
 * swaps in automatically once compiled. A single surface failing = that slot keeps base (local degradation, never the whole pack).
 * registry.ts stays purely synchronous (light SSR); compile goes through dynamic import, out of the main bundle.
 */
import type { Component } from 'svelte';
import { injectCss, instantiate } from '$lib/workshop/compile';
import {
	artifactKey,
	cacheCounters,
	getCachedArtifact,
	hashSource,
	purgeThemeArtifacts,
	putCachedArtifact
} from './compile-cache';
import { themeManifest, type DbThemeBehaviors, type ThemeManifest } from './index';
import type { ThemePack, ThemeSurface } from './contracts';
import type { DbThemeSurfaces } from '$lib/server/themes';
import { ensureThemePack, themePack } from './registry';

export interface DbThemeWire {
	id: string;
	label: string;
	base: string;
	version: number;
	tokensCss: string;
	surfaces: DbThemeSurfaces;
	behaviors?: DbThemeBehaviors;
	updatedAt: number;
}

let packs = $state<Record<string, ThemePack>>({});
let metas = $state<Record<string, DbThemeWire>>({});
let loadPromise: Promise<void> | null = null;
/** tick bumps when a compiled pack lands — layout plays the swap fade off it
 * (module-exported state must not be reassigned: object wrapper per Svelte rules) */
export const swapSignal = $state({ tick: 0 });

export function isDbTheme(id: unknown): id is `db-${string}` {
	return typeof id === 'string' && id.startsWith('db-');
}

/** for manifest integration (c2 admin list merging) */
export function dbThemeMetas(): DbThemeWire[] {
	return Object.values(metas);
}

/** manifest: db- themes use the base behavior/swatches + their own label (shared by admin list & progress bars) */
export function resolveManifest(id: unknown): ThemeManifest {
	if (!isDbTheme(id)) return themeManifest(id);
	const meta = metas[id];
	const base = themeManifest(meta?.base ?? 'abstract');
	return {
		...base,
		label: meta?.label ?? base.label,
		// batch 4: per-theme behavior overrides (transition/preloader/staggerScale)
		behavior: { ...base.behavior, ...(meta?.behaviors ?? {}) }
	};
}

/** @deprecated kept for callers; behavior now flows through resolveManifest */
export function behaviorId(id: string): string {
	return isDbTheme(id) ? (metas[id]?.base ?? 'abstract') : id;
}

/** sync resolve: db- theme → compiled pack; not ready (incl. SSR) → base pack (abstract without meta) */
export function resolvePack(id: unknown): ThemePack {
	if (!isDbTheme(id)) return themePack(id);
	const ready = packs[id];
	if (ready) return ready;
	void ensureDbThemes();
	return themePack(metas[id]?.base ?? 'abstract');
}

/** fetch /api/themes (deduped + retryable on failure); fills metas, triggers no compilation */
export async function ensureDbThemes(): Promise<void> {
	if (!loadPromise) {
		loadPromise = (async () => {
			try {
				// no-store: editors need save-to-preview immediacy; the browser must not
				// serve the max-age window's stale wire (edge s-maxage still works)
				const res = await fetch('/api/themes', { cache: 'no-store' });
				if (!res.ok) return;
				const data = (await res.json()) as { themes?: DbThemeWire[] };
				for (const t of data.themes ?? []) metas[t.id] = t;
			} catch {
				/* network failure: clear loadPromise so the next resolve retries */
			} finally {
				if (Object.keys(metas).length === 0) loadPromise = null;
			}
		})();
	}
	return loadPromise;
}

/** compile and mount the given db theme (caller: layout $effect calls once per activeTheme) */
export async function mountDbTheme(id: string): Promise<void> {
	if (!isDbTheme(id) || packs[id]) return;
	await ensureDbThemes();
	const wire = metas[id];
	if (!wire || packs[id]) return;
	const comps: Partial<Record<ThemeSurface, Component>> = {};
	for (const [surface, src] of Object.entries(wire.surfaces) as [
		ThemeSurface,
		{ code: string; css?: string } | undefined
	][]) {
		if (!src?.code) continue;
		const key = artifactKey(id, surface);
		const hash = hashSource(src.code + '\u0000' + (src.css ?? ''));
		// P2 cache path: skip downloading/running svelte/compiler entirely
		const cached = await getCachedArtifact(key);
		if (cached?.hash === hash && cached.body) {
			cacheCounters.hits++;
			try {
				const comp = instantiate(cached.body);
				if (cached.css) injectCss(`${id}-${surface}`, cached.css);
				comps[surface] = comp;
				continue;
			} catch {
				/* stale artifact — fall through to full compile */
			}
		}
		cacheCounters.misses++;
		try {
			const { compileComponentSource } = await import('$lib/workshop/compile');
			const out = await compileComponentSource(`${id}-${surface}`, src.code);
			if (out.ok && out.component && out.body) {
				if (src.css) injectCss(`${id}-${surface}`, src.css);
				comps[surface] = out.component;
				cacheCounters.stores++;
				void putCachedArtifact({ key, hash, body: out.body, css: src.css ?? '' });
			} else {
				console.warn(
					`[theme:${id}] ${surface} compile failed: ${'error' in out ? out.error : 'unknown'}`
				);
			}
		} catch (e) {
			console.warn(`[theme:${id}] ${surface} compile threw`, e);
		}
	}
	if (Object.keys(comps).length) {
		await ensureThemePack(wire.base); // 79a-slim: lazy packs must land before merging base slots
		const first = !packs[id];
		packs[id] = { ...themePack(wire.base), ...comps };
		if (first) swapSignal.tick++;
	}
	if (wire.tokensCss) injectTokens(id, wire.tokensCss);
}

export function injectTokens(id: string, css: string): void {
	if (typeof document === 'undefined') return;
	const attr = 'data-db-theme-tokens';
	// P2: SSR already inlined identical tokens (layout.server) — no client re-inject
	const existing = document.head.querySelector(`style[${attr}="${id}"]`);
	if (existing && existing.textContent?.trim() === css.trim()) return;
	existing?.remove();
	if (!css.trim()) return;
	const el = document.createElement('style');
	el.setAttribute(attr, id);
	el.textContent = css;
	document.head.appendChild(el);
}

/** refresh after save/delete (next resolve uses the new version; tokens cleared too) */
export function invalidateDbThemes(): void {
	for (const id of Object.keys(metas)) void purgeThemeArtifacts(id);
	packs = {};
	metas = {};
	loadPromise = null;
	if (typeof document !== 'undefined')
		document.head.querySelectorAll('style[data-db-theme-tokens]').forEach((el) => el.remove());
}
