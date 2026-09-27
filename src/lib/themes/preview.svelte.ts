/**
 * Structure preview toggle (Phase 20.5 B) — when admin clicks a card to preview, sessionStorage
 * overrides the theme for THIS TAB only; cross-page navigation keeps the preview; ending preview or closing the tab
 * restores the server-authoritative value. The server value flows via page.data (not this store) → preview is a pure
 * client-side concept; SSR always sees null.
 */
import { isValidThemeId, type ActiveThemeId } from './index';

const KEY = 'kikigaki-ui-theme-preview';

let preview = $state<ActiveThemeId | null>(null);

export function getThemePreview(): ActiveThemeId | null {
	return preview;
}

export function setThemePreview(id: ActiveThemeId | null): void {
	preview = id;
	if (typeof sessionStorage !== 'undefined') {
		if (id) sessionStorage.setItem(KEY, id);
		else sessionStorage.removeItem(KEY);
	}
}

/** browser-only, called once (root layout): restores this tab's preview from sessionStorage */
export function restoreThemePreview(): void {
	if (typeof sessionStorage === 'undefined') return;
	const v = sessionStorage.getItem(KEY);
	if (isValidThemeId(v)) preview = v;
}
