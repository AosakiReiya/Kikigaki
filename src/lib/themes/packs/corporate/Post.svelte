<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	/**
	 * Corporate post: report/whitepaper paradigm — breadcrumb, category eyebrow,
	 * contained headline, quiet meta row, inline TOC box, wide readable body,
	 * restrained prev/next. Same functional contract as the base pack
	 * (PostBody guard, scrollspy TOC, smartBack, comments, series books).
	 */
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { smartBack } from '$lib/smart-back';
	import { formatDate } from '$lib/format';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import TocFab from '$lib/components/TocFab.svelte';
	import PostBody from '$lib/components/PostBody.svelte';
	import { scrollSpy, type SpyState } from '$lib/content/scrollspy';
	import type { PostProps } from '../../contracts';

	let {
		post,
		adjacent,
		seriesBooks,
		basePath = '/blog',
		flush = false,
		hideToc = false
	}: PostProps = $props();

	let bodyEl = $state<HTMLElement>();
	let tocEl = $state<HTMLElement>();
	let spy = $state<SpyState>({ id: null, progress: 0, idx: -1, total: 0, overall: 0 });
	$effect(() => {
		const root = bodyEl;
		if (!root || post.toc.length === 0) return;
		return scrollSpy(root, (s) => (spy = s));
	});

	const backOnClick = (e: MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		smartBack();
	};
</script>

<ExtensionSlot name="post.before" />

<article class="report" class:flush data-animate="article">
	<nav class="crumbs" aria-label="breadcrumb">
		<a href="/" onclick={backOnClick}>{m.nav_home()}</a>
		<span aria-hidden="true">/</span>
		<a href={href('/blog')}>{m.nav_blog()}</a>
		<span aria-hidden="true">/</span>
		<span class="here">{post.title}</span>
	</nav>

	<header class="head" data-animate="article-head">
		{#if !post.translated}<p class="untranslated" role="note">{m.post_untranslated()}</p>{/if}
		<span class="eyebrow">{post.categoryDisplay}</span>
		<h1 data-animate="article-title">{post.title}</h1>
		{#if post.summary}<p class="deck">{post.summary}</p>{/if}
		<p class="meta">
			<time datetime={post.date}>{formatDate(post.date)}</time>
			<span aria-hidden="true">·</span>
			<span>{m.post_minutes({ minutes: post.readingMinutes })}</span>
			{#if post.tags.length > 0}
				<span class="tags">
					{#each post.tags as tag (tag.name)}
						<a class="tag" href={href(`/tags/${encodeURIComponent(tag.name)}`)}>{tag.display}</a>
					{/each}
				</span>
			{/if}
		</p>
	</header>

	{#if post.cover}
		<figure class="cover" data-animate="article-cover">
			<img src={post.cover} alt={post.title} width="1200" height="630" fetchpriority="high" />
		</figure>
	{/if}

	<div class="shell">
		{#if post.toc.length > 0 && !hideToc}
			<nav class="side" bind:this={tocEl} aria-label={m.post_toc()}>
				<p class="side-title">{m.post_toc()}</p>
				<ol>
					{#each post.toc as item (item.id)}
						<li>
							<a href={`#${item.id}`} class:cur={spy.id === item.id}>{item.text}</a>
						</li>
					{/each}
				</ol>
			</nav>
		{/if}

		<div class="body" bind:this={bodyEl}>
			<PostBody html={post.contentHtml} />
		</div>
	</div>

	{#if seriesBooks && seriesBooks.length > 0}
		<p class="book-line">
			{#each seriesBooks as bk, i (bk.slug)}
				{#if i > 0}·{/if}
				{m.series_in_book()}
				<a href={href(`/series/${bk.slug}`)}>《{bk.title}》→ {m.series_read_book()}</a>
			{/each}
		</p>
	{/if}

	{#if adjacent.prev || adjacent.next}
		<nav class="adjacent" aria-label={m.adjacent_nav()}>
			{#if adjacent.prev}
				<a href={href(`${basePath}/${adjacent.prev.slug}`)} data-dir="prev">
					<span class="lbl">← {m.post_prev()}</span>
					<span class="t">{adjacent.prev.title}</span>
				</a>
			{:else}
				<span></span>
			{/if}
			{#if adjacent.next}
				<a href={href(`${basePath}/${adjacent.next.slug}`)} data-dir="next" class="next">
					<span class="lbl">{m.post_next()} →</span>
					<span class="t">{adjacent.next.title}</span>
				</a>
			{/if}
		</nav>
	{/if}

	<CommentSection slug={post.slug} />
</article>

<ExtensionSlot name="post.after" />

{#if post.toc.length > 0 && !hideToc}
	<TocFab items={post.toc} inline={tocEl} />
{/if}

<style>
	.report {
		max-width: 74rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 1rem;
	}
	.report.flush {
		max-width: none;
		padding-inline: 0;
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-bottom: 2rem;
		min-width: 0;
	}
	.crumbs a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.crumbs a:hover {
		color: var(--color-accent);
	}
	.here {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-ink);
	}
	.head {
		max-width: 46rem;
		margin: 0 auto 2rem;
	}
	.untranslated {
		font-size: 0.75rem;
		color: #d97706;
		margin: 0 0 0.5rem;
	}
	.eyebrow {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 0.75rem;
	}
	h1 {
		margin: 0 0 0.75rem;
		font-size: clamp(1.75rem, 3.4vw, 2.5rem);
		line-height: 1.18;
		letter-spacing: -0.015em;
		font-weight: 700;
	}
	.deck {
		margin: 0 0 1rem;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}
	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.tags {
		display: inline-flex;
		gap: 0.375rem;
		margin-left: 0.75rem;
	}
	.tag {
		font-size: 0.6875rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		padding: 0.1rem 0.5rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.tag:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.cover {
		margin: 0 auto 2.5rem;
		max-width: 62rem;
	}
	.cover img {
		width: 100%;
		height: auto;
		border-radius: 0.875rem;
		border: 1px solid var(--color-line);
	}
	.shell {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		gap: 3rem;
		align-items: start;
		max-width: 62rem;
		margin: 0 auto;
	}
	.report.flush .shell {
		max-width: none;
	}
	.side {
		position: sticky;
		top: 5.5rem;
		max-height: calc(100dvh - 8rem);
		overflow: auto;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 0.875rem 1rem;
		background: var(--color-bg-elevated);
	}
	.side-title {
		margin: 0 0 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.side ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.125rem;
		font-size: 0.8125rem;
	}
	.side a {
		display: block;
		padding: 0.25rem 0.4rem;
		border-radius: 0.375rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.side a:hover,
	.side a.cur {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
	.body {
		min-width: 0;
		max-width: 46rem;
	}
	.book-line {
		max-width: 62rem;
		margin: 2rem auto 0;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}
	.book-line a {
		color: var(--color-accent);
		text-decoration: none;
	}
	.adjacent {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		max-width: 62rem;
		margin: 2.5rem auto 0;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-line);
	}
	.adjacent a {
		display: grid;
		gap: 0.25rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		text-decoration: none;
		color: var(--color-ink);
		transition: border-color 0.15s ease;
	}
	.adjacent a:hover {
		border-color: var(--color-accent);
	}
	.adjacent a.next {
		text-align: right;
	}
	.lbl {
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.t {
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.4;
	}
	@media (max-width: 62rem) {
		.shell {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}
		.side {
			position: static;
			max-height: none;
		}
	}
</style>
