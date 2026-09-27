/**
 * Analytics chart palette (Phase 39): pure localStorage persistence;
 * dashboard and Chart components share one reactive source, color changes repaint instantly.
 */
const KEY = 'kk-chart-palette';
export const DEFAULT_PALETTE = ['#5b8def', '#f2994a', '#27ae60', '#eb5757', '#9b51e0', '#f2c94c'];
export const PRESETS: { name: string; colors: string[] }[] = [
	{ name: '預設', colors: DEFAULT_PALETTE },
	{ name: '柔和', colors: ['#a5c9fa', '#ffd8a8', '#b2f2bb', '#ffc9c9', '#d0bfff', '#ffe28a'] },
	{ name: '高對比', colors: ['#0057ff', '#ff6d00', '#00c853', '#d50000', '#aa00ff', '#ffd600'] },
	{ name: '水墨', colors: ['#141414', '#3d3d3d', '#666666', '#8f8f8f', '#b8b8b8', '#e0e0e0'] }
];
const HEX = /^#[0-9a-f]{6}$/i;

function initial(): string[] {
	try {
		if (typeof localStorage === 'undefined') return [...DEFAULT_PALETTE];
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const p: unknown = JSON.parse(raw);
			if (
				Array.isArray(p) &&
				p.length === DEFAULT_PALETTE.length &&
				p.every((c) => HEX.test(String(c)))
			)
				return p.map(String);
		}
	} catch {
		/* fallthrough */
	}
	return [...DEFAULT_PALETTE];
}

let colors = $state<string[]>(initial());

function persist(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(colors));
	} catch {
		/* quota */
	}
}

export const chartPalette = {
	get colors() {
		return colors;
	},
	set(i: number, hex: string): void {
		if (!HEX.test(hex)) return;
		colors = colors.map((c, j) => (j === i ? hex : c));
		persist();
	},
	apply(preset: string[]): void {
		colors = [...preset];
		persist();
	},
	reset(): void {
		colors = [...DEFAULT_PALETTE];
		persist();
	}
};
