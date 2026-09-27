<script lang="ts">
	/* * :::chart — chart.js charts (dynamic import, loaded only when used); data is a JSON body or the data= param */
	import type { ChartConfiguration } from 'chart.js';

	let {
		type = 'line',
		data,
		options = {},
		height = 280
	}: {
		type?: string;
		data?: unknown;
		options?: Record<string, unknown>;
		height?: number;
	} = $props();

	let canvas = $state<HTMLCanvasElement | undefined>();
	let error = $state('');

	$effect(() => {
		if (!canvas || !data) {
			if (!data) error = 'chart：缺少 data（JSON 內文或 data= 參數）';
			return;
		}
		const el = canvas;
		const chartType = String(type);
		let chart: { destroy(): void } | undefined;
		let dead = false;
		void import('chart.js/auto')
			.then((mod) => {
				if (dead) return;
				const Chart = mod.default;
				const css = getComputedStyle(document.documentElement);
				Chart.defaults.color = css.getPropertyValue('--color-ink-muted').trim() || '#888';
				Chart.defaults.borderColor = css.getPropertyValue('--color-line').trim() || '#333';
				Chart.defaults.font.family = css.getPropertyValue('--font-body') || 'inherit';
				chart = new Chart(el, {
					type: chartType as ChartConfiguration['type'],
					data: data as ChartConfiguration['data'],
					options: {
						responsive: true,
						maintainAspectRatio: false,
						color: (css.getPropertyValue('--color-accent').trim() || '#66aaff') as never,
						...options
					}
				} as ChartConfiguration);
			})
			.catch(() => {
				error = 'chart.js 載入失敗';
			});
		return () => {
			dead = true;
			chart?.destroy();
		};
	});
</script>

{#if data}
	<div class="chart-block" style:height="{Number(height)}px">
		<canvas bind:this={canvas}></canvas>
	</div>
{:else}
	<p class="chart-error">{error || 'chart：等待資料'}</p>
{/if}

<style>
	.chart-block {
		position: relative;
		width: 100%;
		min-width: 0;
		margin: 2rem 0;
		padding: 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
	}

	.chart-error {
		margin: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
