<script lang="ts">
	import { href } from '$lib/nav';
	import * as m from '$lib/paraglide/messages';
	import type { SeriesIndexProps } from '../../contracts';

	let { series, page, totalPages }: SeriesIndexProps = $props();
	const mode = (cover: boolean) => `drwxr-xr-x${cover ? '+' : '-'}`;
</script>

<section class="t-series" data-swap-region>
	<h1 class="t-cmd-head"><span class="t-prompt">$</span> ls ~/series</h1>
	<p class="t-count"># {m.series_index_lede()}</p>

	{#if series.length === 0}
		<p class="t-none">[] {m.series_empty()}</p>
	{:else}
		<table class="t-ls">
			<tbody>
				{#each series as s (s.slug)}
					<tr>
						<td class="t-mode">{mode(Boolean(s.cover))}</td>
						<td class="t-name">
							<a href={href(`/series/${s.slug}`)}>{s.slug}</a>
						</td>
						<td class="t-n">{s.count}p</td>
					</tr>
					<tr class="t-desc-row">
						<td></td>
						<td colspan="2" class="t-desc">{s.title}{s.summary ? ` — ${s.summary}` : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if totalPages > 1}
		<p class="t-pager">
			{#if page > 1}<a href={`/series?page=${page - 1}`}>← prev</a>{/if}
			<span>[{page}/{totalPages}]</span>
			{#if page < totalPages}<a href={`/series?page=${page + 1}`}>next →</a>{/if}
		</p>
	{/if}
</section>

<style>
	.t-series {
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}

	.t-cmd-head {
		font-size: 1.125rem;
		font-weight: 700;
	}

	.t-prompt {
		color: var(--color-accent);
	}

	.t-pager {
		display: flex;
		gap: 1rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-top: 1rem;
	}

	.t-pager a {
		color: var(--color-strong);
		text-decoration: none;
	}

	.t-count {
		color: var(--color-ink-muted);
		margin: 0.25rem 0 1.25rem;
	}

	.t-none {
		color: var(--color-ink-muted);
	}

	.t-ls {
		width: 100%;
		border-collapse: collapse;
	}

	.t-ls td {
		padding: 0.15rem 0.75rem 0.15rem 0;
		vertical-align: top;
	}

	.t-mode {
		color: var(--color-ink-muted);
		width: 7.5rem;
	}

	.t-name a {
		color: var(--color-strong);
		text-decoration: none;
	}

	.t-name a:hover {
		text-decoration: underline;
	}

	.t-n {
		color: var(--color-ink-muted);
		text-align: right;
		width: 3.5rem;
	}

	.t-desc {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		padding-bottom: 0.6rem;
	}
</style>
