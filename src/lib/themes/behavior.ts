/**
 * Behavior of the currently active theme (transition style / Preloader / stagger tempo).
 * Applied by the root layout on load and settings changes; read by animation modules (pure in-memory singleton, client-only reads).
 */
import { themeManifest, type ThemeBehavior, type ThemeId } from './index';

let current: ThemeBehavior = themeManifest('abstract').behavior;

export function applyThemeBehavior(id: ThemeId | string | null | undefined): void {
	current = themeManifest(id).behavior;
}

/** Batch 4: apply a resolved behavior object directly (DB themes override base presets). */
export function applyResolvedBehavior(b: ThemeBehavior): void {
	current = b;
}

export function themeBehavior(): ThemeBehavior {
	return current;
}
