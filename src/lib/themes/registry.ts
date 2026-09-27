/**
 * Pack registry (Phase 20.5 → 79a-slim) — themeId → structural component set.
 * Themes without their own structure (minimal) reuse the abstract pack (differences live in tokens + behavior).
 *
 * abstract is static (the baseline for every fallback path; always used for the SSR first render); other packs are
 * dynamically imported — visitors only download the surface set actually enabled (slimmed from the old world where
 * all 5 packs entered the shared chunk). Before rendering, the ensureThemePack fence in +layout.server / +layout.ts
 * preloads; synchronous reads (themePack/packs) only see a pack after ensure completes, otherwise fall back to abstract.
 */
import type { ThemeId } from './index';
import { isThemeId } from './index';
import type { ThemePack } from './contracts';
import { abstractPack } from './packs/abstract';
// theme-scaffold:imports (new-pack import injection point — keep empty under the lazy regime)

export const packs: Partial<Record<ThemeId, ThemePack>> = {
	abstract: abstractPack
};

/** dynamic loaders (vite splits chunks per call site; theme-create injects here) */
const loaders: Partial<Record<ThemeId, () => Promise<ThemePack>>> = {
	shop: async () => (await import('./packs/shop')).shopPack,
	// theme-scaffold:packs (structural-pack injection point)
	terminal: async () => (await import('./packs/terminal')).terminalPack,
	corporate: async () => (await import('./packs/corporate')).corporatePack,
	magazine: async () => (await import('./packs/magazine')).magazinePack,
	news: async () => (await import('./packs/news')).newsPack
};

const inflight = new Map<ThemeId, Promise<void>>();

/** idempotent pack preload (shared by SSR and client; permanently cached into packs after loading) */
export function ensureThemePack(id: unknown): Promise<void> {
	if (!isThemeId(id)) return Promise.resolve();
	if (packs[id]) return Promise.resolve();
	const loader = loaders[id];
	if (!loader) return Promise.resolve(); // minimal etc. = intentional fallback to abstract
	let p = inflight.get(id);
	if (!p) {
		p = loader()
			.then((pack) => {
				packs[id] = pack;
				inflight.delete(id);
			})
			.catch(() => {
				inflight.delete(id); // broken pack → fall back to abstract rendering; never hard-stuck
			});
		inflight.set(id, p);
	}
	return p;
}

export function themePack(id: unknown): ThemePack {
	return isThemeId(id) && packs[id] ? packs[id] : abstractPack;
}
