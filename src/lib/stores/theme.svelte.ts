import { browser } from '$app/environment';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'kikigaki-theme';

let preference = $state<ThemePreference>('dark');
let resolved = $state<ResolvedTheme>('dark');
let initialized = false;

function systemPrefersDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyResolved() {
	resolved = preference === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : preference;
	document.documentElement.setAttribute('data-theme', resolved);
}

/** call once in root layout onMount */
export function initTheme() {
	if (!browser || initialized) return;
	initialized = true;

	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark' || stored === 'auto') {
		preference = stored;
	}
	applyResolved();

	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (preference === 'auto') applyResolved();
	});
}

/** light → dark → auto cycle */
export function cycleTheme() {
	const order: ThemePreference[] = ['light', 'dark', 'auto'];
	preference = order[(order.indexOf(preference) + 1) % order.length];
	localStorage.setItem(STORAGE_KEY, preference);
	applyResolved();
}

export function getThemePreference(): ThemePreference {
	return preference;
}

export function getResolvedTheme(): ResolvedTheme {
	return resolved;
}
