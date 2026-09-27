/**
 * 78f (B1) — theme context-route resolution (pure functions, client-safe).
 * pack.routes is the declaration source; the cross-pack union of paths = reserved custom-page slugs.
 * DB themes (db-*) don't support routes in v1 (their surfaces go through the compile sandbox) → returns null.
 */
import { packs } from './registry';
import { isThemeId, type ThemeId } from './index';
import type { ThemeRouteDef } from './contracts';

export function themeRoutes(id: unknown): ThemeRouteDef[] | undefined {
	if (!isThemeId(id)) return undefined;
	return packs[id as ThemeId]?.routes;
}

export function resolveThemeRoute(id: unknown, slug: string): ThemeRouteDef | null {
	return themeRoutes(id)?.find((r) => r.path === slug) ?? null;
}

/** nav override: theme_content.nav = [{href,label}]; only a non-empty array takes effect (null = theme hasn't taken over nav) */
export function themeNav(
	themeContent: Record<string, unknown> | undefined | null
): { href: string; label: string }[] | null {
	const raw = themeContent?.nav;
	if (!Array.isArray(raw)) return null;
	const items = raw
		.filter(
			(x): x is { href: string; label: string } =>
				!!x &&
				typeof x === 'object' &&
				typeof (x as { href?: unknown }).href === 'string' &&
				typeof (x as { label?: unknown }).label === 'string'
		)
		.slice(0, 8)
		.map((x) => ({ href: x.href.slice(0, 200), label: x.label.slice(0, 40) }));
	return items.length ? items : null;
}

/** union of context paths across all packs (admin page-slug reserved-word check; conservatively takes the all-theme union) */
export function allThemeRoutePaths(): string[] {
	const set = new Set<string>();
	for (const pack of Object.values(packs)) for (const r of pack?.routes ?? []) set.add(r.path);
	return [...set];
}
