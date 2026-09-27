<script lang="ts">
	import Post from './Post.svelte';
	import { href } from '$lib/nav';
	import * as m from '$lib/paraglide/messages';
	import type { SeriesProps } from '../../contracts';

	let { book, chapters, current, adjacent }: SeriesProps = $props();
</script>

<section class="t-book">
	<h1 class="t-cmd-head">
		<span class="t-prompt">$</span> cat ~/series/{book.slug}{#if current}/{current.slug}{/if}
	</h1>
	<p class="t-meta">
		<span class="t-title">{book.title}</span> · {chapters.length}p ·
		<a class="t-back" href={href('/series')}>../</a>
	</p>
	{#if book.summary}<p class="t-sum">{book.summary}</p>{/if}

	{#if chapters.length > 0}
		<nav class="t-toc" aria-label={m.series_toc()}>
			{#each chapters as c, i (c.slug)}
				<a
					class="t-toc-row"
					class:active={current?.slug === c.slug}
					href={href(`/series/${book.slug}/${c.slug}`)}
				>
					<span class="t-toc-n">{String(i + 1).padStart(2, '0')}</span>
					<span>{current?.slug === c.slug ? '▶ ' : ''}{c.title}</span>
				</a>
				{#if current?.slug === c.slug && current.toc.length > 0}
					{#each current.toc as h (h.id)}
						<a class="t-toc-sub" class:d3={h.depth === 3} href={`#${h.id}`}>· {h.text}</a>
					{/each}
				{/if}
			{/each}
		</nav>
	{/if}

	<div class="t-chapter-wrap" data-swap-region data-swap-scrolltop>
		{#key current?.slug ?? 'none'}
			{#if current}
				<div class="t-chapter">
					<Post
						post={current}
						adjacent={adjacent ?? {}}
						basePath={`/series/${book.slug}`}
						hideToc
					/>
				</div>
			{:else}
				<p class="t-none">[] {m.series_empty()}</p>
			{/if}
		{/key}
	</div>
</section>

<style>
	.t-book {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		max-width: 72rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}

	.t-cmd-head {
		font-size: 1.125rem;
		font-weight: 700;
	}

	.t-prompt {
		color: var(--color-accent);
	}

	.t-meta {
		color: var(--color-ink-muted);
		margin: 0.25rem 0 0;
	}

	.t-title {
		color: var(--color-strong);
	}

	.t-back {
		color: var(--color-strong);
		text-decoration: none;
	}

	.t-back:hover {
		text-decoration: underline;
	}

	.t-sum {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		margin: 0.25rem 0 0;
	}

	.t-toc {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin: 1rem 0 1.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}

	.t-toc-row {
		display: flex;
		gap: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 0.3rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		font-size: 0.8125rem;
	}

	.t-toc-row:hover {
		color: var(--color-ink);
		background: color-mix(in oklab, var(--color-ink) 6%, transparent);
	}

	.t-toc-row.active {
		color: var(--color-accent);
	}

	.t-toc-n {
		opacity: 0.7;
	}

	.t-toc-sub {
		display: block;
		padding: 0.1rem 0.5rem 0.1rem 2.4rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.t-toc-sub:hover {
		color: var(--color-ink);
	}

	.t-toc-sub.d3 {
		padding-left: 3.2rem;
	}

	.t-none {
		color: var(--color-ink-muted);
	}

	.t-chapter-wrap {
		position: relative;
	}

	.t-chapter {
		border-top: 1px dashed var(--color-line);
		padding-top: 1rem;
	}
</style>
