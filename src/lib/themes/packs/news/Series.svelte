<script lang="ts">
	import Post from './Post.svelte';
	import { href } from '$lib/nav';
	import * as m from '$lib/paraglide/messages';
	import { ensureGsap } from '$lib/animation/core';
	import { prefersReducedMotion } from '$lib/animation/config';
	import { scrollSpy, type SpyState } from '$lib/content/scrollspy';
	import type { SeriesProps } from '../../contracts';

	let { book, chapters, current, adjacent }: SeriesProps = $props();

	let tocOpen = $state(false);
	const pos = $derived(current ? chapters.findIndex((c) => c.slug === current.slug) + 1 : 0);

	let mainEl = $state<HTMLElement>();
	let spy = $state<SpyState>({ id: null, progress: 0, idx: -1, total: 0, overall: 0 });

	/* chapters (incl. switching) ready: install scroll-spy + heading entrance animations */
	$effect(() => {
		const slug = current?.slug;
		const root = mainEl;
		if (!slug || !root) return;
		const stop = scrollSpy(root, (s) => (spy = s));
		if (!prefersReducedMotion()) {
			requestAnimationFrame(() => {
				const subs = root.parentElement?.querySelectorAll('.toc-subs .toc-sub') ?? [];
				if (subs.length) {
					const gsap = ensureGsap();
					gsap.fromTo(
						subs,
						{ autoAlpha: 0, y: 6 },
						{
							autoAlpha: 1,
							y: 0,
							stagger: 0.05,
							duration: 0.32,
							ease: 'power2.out',
							clearProps: 'transform'
						}
					);
				}
			});
		}
		return stop;
	});
</script>

<div class="book">
	<button
		type="button"
		class="toc-toggle"
		aria-expanded={tocOpen}
		onclick={() => (tocOpen = !tocOpen)}>☰ {m.series_toc()}</button
	>
	{#if tocOpen}
		<div class="toc-scrim" role="presentation" onclick={() => (tocOpen = false)}></div>
	{/if}

	<aside class="toc" class:open={tocOpen} aria-label={m.series_toc()}>
		<a class="toc-back" href={href('/series')}>← {m.series_title()}</a>
		{#if book.cover}<img class="toc-cover" src={book.cover} alt="" width="1200" height="630" />{/if}
		<h1 class="toc-title">{book.title}</h1>
		{#if book.summary}<p class="toc-sum">{book.summary}</p>{/if}
		{#if chapters.length > 0}
			<div
				class="toc-bar"
				role="progressbar"
				aria-valuenow={pos}
				aria-valuemin="0"
				aria-valuemax={chapters.length}
			>
				<div class="toc-bar-fill" style="--p: {pos / chapters.length}"></div>
			</div>
			<p class="toc-count">{m.series_progress({ current: pos, total: chapters.length })}</p>
			<nav class="toc-list">
				{#each chapters as c, i (c.slug)}
					<a
						class="toc-item"
						class:active={current?.slug === c.slug}
						href={href(`/series/${book.slug}/${c.slug}`)}
						onclick={() => (tocOpen = false)}
					>
						<span class="toc-n">{String(i + 1).padStart(2, '0')}</span>
						<span class="toc-t">{c.title}</span>
					</a>
					{#if current?.slug === c.slug && current.toc.length > 0}
						<div class="toc-subs">
							{#each current.toc as h (h.id)}
								<a
									class="toc-sub"
									class:d3={h.depth === 3}
									class:now={spy.id === h.id}
									href={`#${h.id}`}
								>
									{h.text}
									{#if spy.id === h.id}
										<span class="sub-track"><i style={`--p:${spy.progress}`}></i></span>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				{/each}
			</nav>
		{/if}
	</aside>

	<main class="book-main" bind:this={mainEl} data-swap-region data-swap-scrolltop>
		{#key current?.slug ?? 'cover'}
			{#if current}
				<Post
					post={current}
					adjacent={adjacent ?? {}}
					basePath={`/series/${book.slug}`}
					flush
					hideToc
				/>
			{:else}
				<header class="book-hero">
					{#if book.cover}<img
							class="hero-cover"
							src={book.cover}
							alt=""
							width="1200"
							height="630"
						/>{/if}
					<h1 class="hero-title">{book.title}</h1>
					{#if book.summary}<p class="hero-sum">{book.summary}</p>{/if}
					<p class="hero-empty">{m.series_empty()}</p>
				</header>
			{/if}
		{/key}
	</main>
</div>

<style>
	.book {
		display: grid;
		grid-template-columns: 17rem minmax(0, 1fr);
		gap: 2rem;
		max-width: 96rem;
		margin: 0 auto;
		padding: 1.5rem 0.75rem 5rem;
	}

	.toc-toggle {
		display: none;
	}

	.toc {
		position: sticky;
		top: 5rem;
		align-self: start;
		max-height: calc(100vh - 6.5rem);
		overflow-y: auto;
		padding-right: 1rem;
		border-right: 1px solid var(--color-line);
	}

	.toc-back {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.toc-back:hover {
		color: var(--color-strong);
	}

	.toc-cover {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0.5rem;
		margin-top: 0.75rem;
	}

	.toc-title {
		margin-top: 0.75rem;
		font-size: 1.25rem;
		font-weight: 800;
		line-height: 1.35;
	}

	.toc-sum {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}

	.toc-bar {
		margin-top: 1rem;
		height: 3px;
		border-radius: 999px;
		background: var(--color-line);
		overflow: hidden;
	}

	.toc-bar-fill {
		height: 100%;
		width: calc(var(--p) * 100%);
		background: var(--color-strong);
		border-radius: inherit;
		transition: width 0.3s ease;
	}

	.toc-count {
		margin-top: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.toc-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
	}

	.toc-item {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.55rem 0.6rem;
		transition:
			color 0.2s ease,
			background-color 0.2s ease;
		margin: 0 -0.5rem;
		border-radius: 0.4rem;
		text-decoration: none;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.toc-item:hover {
		color: var(--color-ink);
		background: color-mix(in oklab, var(--color-ink) 5%, transparent);
	}

	.toc-item.active {
		color: var(--color-strong);
		background: color-mix(in oklab, var(--color-strong) 10%, transparent);
		font-weight: 600;
	}

	.toc-n {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 0.9375rem;
		font-weight: 700;
		opacity: 0.75;
	}

	.toc-t {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.toc-subs {
		display: flex;
		flex-direction: column;
		margin: 0.15rem 0 0.4rem 1.55rem;
		padding-left: 0.55rem;
		border-left: 1px solid var(--color-line);
	}

	.toc-sub {
		display: block;
		font-size: 0.8125rem;
		line-height: 1.4;
		padding: 0.45rem 0.5rem;
		margin-inline: -0.5rem;
		border-radius: 0.35rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.toc-sub:hover {
		color: var(--color-ink);
	}

	.toc-sub.now {
		position: relative;
		color: var(--color-strong);
		font-weight: 600;
	}

	.sub-track {
		position: absolute;
		left: 0.5rem;
		right: 0.5rem;
		bottom: 0.12rem;
		height: 2px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--color-strong) 16%, var(--color-line));
		overflow: hidden;
	}

	.sub-track i {
		display: block;
		height: 100%;
		width: calc(var(--p, 0) * 100%);
		background: var(--color-strong);
		border-radius: inherit;
		transition: width 0.15s linear;
	}

	.toc-sub.d3 {
		padding-left: 1.4rem;
		font-size: 0.75rem;
	}

	.book-main {
		position: relative;
		min-width: 0;
	}

	.book-hero {
		max-width: 44rem;
	}

	.hero-cover {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 0;
		border: 1px solid var(--color-ink);
	}

	.hero-title {
		margin-top: 1.5rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.hero-sum {
		margin-top: 0.75rem;
		color: var(--color-ink-muted);
		line-height: 1.7;
	}

	.hero-empty {
		margin-top: 2rem;
		color: var(--color-ink-muted);
	}

	@media (max-width: 1023px) {
		.book {
			grid-template-columns: 1fr;
		}

		.toc-toggle {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			position: fixed;
			inset-inline: 1rem;
			top: auto;
			bottom: 1rem;
			z-index: 60;
			justify-self: start;
			justify-content: center;
			padding: 0.55rem 1.1rem;
			border-radius: 999px;
			border: 1px solid var(--color-line);
			background: var(--color-bg-elevated);
			color: var(--color-ink);
			font-size: 0.8125rem;
			cursor: pointer;
			box-shadow: var(--shadow-card-hover, 0 8px 24px rgba(0, 0, 0, 0.25));
		}

		.toc-scrim {
			position: fixed;
			inset: 0;
			z-index: 70;
			background: rgba(0, 0, 0, 0.45);
		}

		.toc {
			position: fixed;
			top: 0;
			bottom: 0;
			inset-inline-start: 0;
			z-index: 80;
			width: min(20rem, 85vw);
			height: 100vh;
			height: 100dvh;
			max-height: none;
			padding: 2rem 1.25rem 4rem;
			background: var(--color-bg-elevated);
			border-right: 1px solid var(--color-line);
			transform: translateX(-105%);
			transition: transform 0.25s ease;
		}

		.toc.open {
			transform: translateX(0);
		}

		.toc-sub {
			font-size: 0.875rem;
		}
	}
</style>
