<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	/**
	 * Newsroom post: wire-story anatomy — dateline kicker, serif headline,
	 * byline row, serif body (18px/1.8), hairline section rules instead of cards.
	 * Same functional contract as the base pack (PostBody, scrollspy, TocFab,
	 * smartBack, comments, series books, prev/next).
	 */
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import { smartBack } from '$lib/smart-back';
	import { formatDate } from '$lib/format';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import TocFab from '$lib/components/TocFab.svelte';
	import PostBody from '$lib/components/PostBody.svelte';
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

	const backOnClick = (e: MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		smartBack();
	};
</script>

<ExtensionSlot name="post.before" />

<article class="story" class:flush data-animate="article">
	<header class="st-head">
		<button type="button" class="back" onclick={backOnClick}>← {m.post_back()}</button>
		{#if !post.translated}<p class="untranslated" role="note">{m.post_untranslated()}</p>{/if}
		<p class="kicker"><span class="k-dot" aria-hidden="true"></span>{post.categoryDisplay}</p>
		<h1>{post.title}</h1>
		{#if post.summary}<p class="standfirst">{post.summary}</p>{/if}
		<div class="byline">
			<span class="by">{site.author.name}</span>
			<span class="sep" aria-hidden="true">|</span>
			<time datetime={post.date}>{formatDate(post.date)}</time>
			<span class="sep" aria-hidden="true">|</span>
			<span>{m.post_minutes({ minutes: post.readingMinutes })}</span>
		</div>
	</header>

	{#if post.cover}
		<figure class="st-cover">
			<img src={post.cover} alt={post.title} width="1200" height="630" fetchpriority="high" />
			<figcaption>{post.title}</figcaption>
		</figure>
	{/if}

	<div class="st-body" bind:this={bodyEl}>
		<PostBody html={post.contentHtml} />
	</div>

	{#if post.tags.length > 0}
		<p class="st-tags">
			{#each post.tags as tag (tag.name)}
				<a href={href(`/tags/${encodeURIComponent(tag.name)}`)}>#{tag.display}</a>
			{/each}
		</p>
	{/if}

	{#if seriesBooks && seriesBooks.length > 0}
		<p class="book-line">
			{#each seriesBooks as bk (bk.slug)}
				{m.series_in_book()}
				<a href={href(`/series/${bk.slug}`)}>《{bk.title}》→ {m.series_read_book()}</a>
			{/each}
		</p>
	{/if}

	{#if adjacent.prev || adjacent.next}
		<nav class="more-lines" aria-label={m.adjacent_nav()}>
			{#if adjacent.prev}
				<a href={href(`${basePath}/${adjacent.prev.slug}`)} data-dir="prev"
					>← {adjacent.prev.title}</a
				>
			{/if}
			{#if adjacent.next}
				<a href={href(`${basePath}/${adjacent.next.slug}`)} data-dir="next"
					>{adjacent.next.title} →</a
				>
			{/if}
		</nav>
	{/if}

	<CommentSection slug={post.slug} />
</article>

<ExtensionSlot name="post.after" />

{#if post.toc.length > 0 && !hideToc}
	<TocFab items={post.toc} inline={bodyEl} />
{/if}

<style>
	.story {
		max-width: 44rem;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 1rem;
	}
	.story.flush {
		max-width: none;
		padding-inline: 0;
	}
	.back {
		border: none;
		background: none;
		font: inherit;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		cursor: pointer;
		padding: 0;
		margin-bottom: 1.5rem;
	}
	.back:hover {
		color: var(--color-accent);
	}
	.untranslated {
		font-size: 0.75rem;
		color: #d97706;
		margin: 0 0 0.5rem;
	}
	.kicker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.875rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.k-dot {
		width: 0.5rem;
		height: 0.5rem;
		background: var(--color-accent);
	}
	h1 {
		margin: 0 0 0.875rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(1.875rem, 4.2vw, 2.625rem);
		line-height: 1.2;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.st-head {
		padding-bottom: 1.125rem;
		border-bottom: 1px solid var(--color-ink);
	}
	.standfirst {
		margin: 0 0 1rem;
		font-size: 1.0625rem;
		line-height: 1.65;
		color: var(--color-ink-muted);
		font-style: italic;
	}
	.byline {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
	.by {
		font-weight: 700;
		color: var(--color-ink);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.sep {
		opacity: 0.5;
	}
	.st-cover {
		margin: 1.75rem 0;
	}
	.st-cover img {
		width: 100%;
		height: auto;
	}
	.st-cover figcaption {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		border-bottom: 1px solid var(--color-line);
		padding-bottom: 0.5rem;
	}
	/* serif body: overrides the prose default font family (this theme only) */
	.st-body :global(.prose) {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.0625rem;
		line-height: 1.85;
	}
	.st-body :global(.prose h2),
	.st-body :global(.prose h3) {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		letter-spacing: 0;
	}
	.st-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		font-size: 0.75rem;
		border-top: 1px solid var(--color-line);
		padding-top: 1rem;
		margin: 1.5rem 0 0;
	}
	.st-tags a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.st-tags a:hover {
		color: var(--color-accent);
	}
	.book-line {
		margin: 1.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.book-line a {
		color: var(--color-accent);
		text-decoration: none;
	}
	.more-lines {
		display: grid;
		gap: 0.375rem;
		margin: 2rem 0 0;
		padding: 1rem 0;
		border-block: 1px solid var(--color-ink);
	}
	.more-lines a {
		font-size: 0.875rem;
		color: var(--color-ink);
		text-decoration: none;
		line-height: 1.5;
	}
	.more-lines a:hover {
		color: var(--color-accent);
	}
</style>
