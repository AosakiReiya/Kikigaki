<script lang="ts">
	import BookCard from '$lib/components/BookCard.svelte';
	import { stagger } from '$lib/animation/stagger';
	import { href } from '$lib/nav';
	import * as m from '$lib/paraglide/messages';
	import type { SeriesIndexProps } from '../../contracts';

	let { series, page, totalPages }: SeriesIndexProps = $props();
</script>

<svelte:head>
	<title>{m.series_title()}</title>
</svelte:head>

<section class="series-page" data-swap-region>
	<h1 class="ser-head">{m.series_title()}</h1>
	<p class="ser-lede">{m.series_index_lede()}</p>

	{#if series.length === 0}
		<p class="ser-empty">{m.series_empty()}</p>
	{:else}
		<ul class="ser-wall" use:stagger={{ target: 'li' }}>
			{#each series as s (s.slug)}
				<li>
					<BookCard
						href={href(`/series/${s.slug}`)}
						title={s.title}
						summary={s.summary}
						cover={s.cover ?? ''}
						count={s.count}
					/>
				</li>
			{/each}
		</ul>
	{/if}

	{#if totalPages > 1}
		<nav class="pagination" aria-label={m.pagination_nav()}>
			{#if page > 1}
				<a class="page-btn" href={`/series?page=${page - 1}`}>← {m.pagination_prev()}</a>
			{:else}
				<span class="page-btn disabled">← {m.pagination_prev()}</span>
			{/if}
			<span class="page-info">{m.pagination_page({ current: page, total: totalPages })}</span>
			{#if page < totalPages}
				<a class="page-btn" href={`/series?page=${page + 1}`}>{m.pagination_next()} →</a>
			{:else}
				<span class="page-btn disabled">{m.pagination_next()} →</span>
			{/if}
		</nav>
	{/if}
</section>

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 2.5rem;
	}

	.page-btn {
		font-size: 0.8125rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		color: var(--color-ink);
		text-decoration: none;
	}

	.page-btn.disabled {
		opacity: 0.35;
		pointer-events: none;
	}

	.page-info {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.series-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 3rem 1.5rem 5rem;
	}

	.ser-head {
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.ser-lede {
		margin-top: 0.5rem;
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}

	.ser-empty {
		margin-top: 3rem;
		color: var(--color-ink-muted);
	}

	/* auto-fill: 13rem floor = moderate book size at 4–5 desktop columns; numeric pagination appears past the per-page count */
	/* 59F: fixed 3×3 matrix — 9 books per page (multiple of 3) so the last row is always tidy;
	   desktop caps at 46rem centered; books stay moderate instead of scaling with the screen */
	.ser-wall {
		list-style: none;
		margin: 2.5rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1.75rem 0.875rem;
	}

	/* 59F.1: 46rem became "one narrow column in the middle" on big screens — widened to 58rem, gaps stretched */
	@media (min-width: 640px) {
		.ser-wall {
			max-width: 58rem;
			margin-inline: auto;
			margin-top: 3.5rem;
			gap: 3.5rem 2.5rem;
		}
	}

	/* mobile three-row small cards: belt one size smaller on one line, description dropped — each cell clean like an app bookshelf */
	@media (max-width: 639px) {
		.ser-wall :global(.bc-band) {
			padding: 1.6rem 0.5rem 0.5rem;
		}

		/* 59P: long book titles wrap to two lines (single-line ellipsis was a pity); truncated only past that height */
		.ser-wall :global(.bc-title) {
			font-size: 0.75rem;
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}

		.ser-wall :global(.bc-meta) {
			font-size: 0.5625rem;
		}

		.ser-wall :global(.bc-sum) {
			display: none;
		}
	}
</style>
