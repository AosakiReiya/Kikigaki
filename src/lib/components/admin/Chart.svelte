<script lang="ts">
	/**
	 * chart.js thin wrapper: dynamic import (bundle loads only on the analytics page),
	 * theme colors follow CSS variables; charts rebuild when props change.
	 */
	import type { ChartConfiguration } from 'chart.js';
	import { chartPalette } from '$lib/stores/chart-palette.svelte';

	const withAlpha = (hex: string, a: number): string =>
		hex +
		Math.round(a * 255)
			.toString(16)
			.padStart(2, '0');
	/* * apply the palette to datasets without explicit colors, per chart type (Phase 39) */
	function withPalette(type: string, raw: unknown, pal: string[]): unknown {
		const d = raw as { labels?: unknown[]; datasets?: Record<string, unknown>[] };
		if (!d?.datasets) return raw;
		return {
			...d,
			datasets: d.datasets.map((ds, i) => {
				const out = { ...ds };
				if (type === 'line') {
					if (!out.borderColor) out.borderColor = pal[i % pal.length];
					if (!out.backgroundColor) out.backgroundColor = withAlpha(pal[i % pal.length], 0.14);
				} else if (type === 'bar') {
					if (!out.backgroundColor)
						out.backgroundColor = (d.labels ?? []).map((_, j) =>
							withAlpha(pal[j % pal.length], 0.75)
						);
					if (!out.borderColor)
						out.borderColor = (d.labels ?? []).map((_, j) => pal[j % pal.length]);
				} else if (type === 'doughnut') {
					if (!out.backgroundColor)
						out.backgroundColor = (
							Array.isArray(d.datasets?.[0]?.data) ? (d.datasets[0].data as unknown[]) : []
						).map((_, j) => withAlpha(pal[j % pal.length], 0.85));
				}
				return out;
			})
		};
	}

	let {
		type,
		data,
		options = {},
		height = 220
	}: {
		type: 'line' | 'bar' | 'doughnut';
		data: unknown;
		options?: Record<string, unknown>;
		height?: number;
	} = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();

	$effect(() => {
		if (!canvas) return;
		// palette sync read = reactive dependency: any color change triggers a rebuild
		const pal = chartPalette.colors.slice();
		const el = canvas;
		let chart: { destroy(): void } | undefined;
		let dead = false;
		void import('chart.js/auto').then((mod) => {
			if (dead) return;
			const Chart = mod.default;
			const css = getComputedStyle(document.documentElement);
			const ink = css.getPropertyValue('--color-ink-muted').trim() || '#888';
			const line = css.getPropertyValue('--color-line').trim() || '#333';
			const accent = css.getPropertyValue('--color-accent').trim() || '#66aaff';
			Chart.defaults.color = ink;
			Chart.defaults.borderColor = line;
			Chart.defaults.font.family = css.getPropertyValue('--font-body') || 'inherit';
			chart = new Chart(el, {
				type,
				data: withPalette(type, data, pal) as ChartConfiguration['data'],
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: { display: false } },
					color: accent,
					...options
				}
			} as ChartConfiguration);
			const g = globalThis as { __kkCharts?: { canvas?: unknown }[] };
			g.__kkCharts = [
				...(g.__kkCharts ?? []).filter((c) => c.canvas),
				chart as { canvas?: unknown }
			];
		});
		return () => {
			dead = true;
			chart?.destroy();
		};
	});
</script>

<div class="chart" style:height="{height}px">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		min-width: 0;
	}
</style>
