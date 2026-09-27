<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	/**
	 * Magazine post: editorial reading page — kicker + big serif title + italic
	 * deck, drop-cap opening paragraph, oversized pull quotes, wide leading,
	 * end mark. Base functional contract intact (PostBody, TocFab, comments,
	 * series, prev/next).
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

<article class="mg-post" class:flush data-animate="article">
	<header class="ph">
		<button type="button" class="back" onclick={backOnClick}>← {m.post_back()}</button>
		{#if !post.translated}<p class="untranslated" role="note">{m.post_untranslated()}</p>{/if}
		<p class="kicker">{post.categoryDisplay}</p>
		<h1>{post.title}</h1>
		{#if post.summary}<p class="deck">{post.summary}</p>{/if}
		<p class="by">
			{site.author.name} · <time datetime={post.date}>{formatDate(post.date)}</time> ·
			{m.post_minutes({ minutes: post.readingMinutes })}
		</p>
	</header>

	{#if post.cover}
		<figure class="cv">
			<img src={post.cover} alt={post.title} width="1200" height="630" fetchpriority="high" />
		</figure>
	{/if}

	<div class="pbody" bind:this={bodyEl}>
		<PostBody html={post.contentHtml} />
	</div>

	<span class="endmark" aria-hidden="true">■</span>

	{#if post.tags.length > 0}
		<p class="tg">
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
		<nav class="more" aria-label={m.adjacent_nav()}>
			{#if adjacent.prev}<a href={href(`${basePath}/${adjacent.prev.slug}`)} data-dir="prev"
					>← {adjacent.prev.title}</a
				>{/if}
			{#if adjacent.next}<a
					class="nx"
					href={href(`${basePath}/${adjacent.next.slug}`)}
					data-dir="next">{adjacent.next.title} →</a
				>{/if}
		</nav>
	{/if}

	<CommentSection slug={post.slug} />
</article>

<ExtensionSlot name="post.after" />

{#if post.toc.length > 0 && !hideToc}
	<TocFab items={post.toc} inline={bodyEl} />
{/if}

<style>
	.mg-post {
		max-width: 40rem;
		margin: 0 auto;
		padding: 3rem 1.5rem 1rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
	}
	.mg-post.flush {
		max-width: none;
		padding-inline: 0;
	}
	.ph {
		text-align: center;
		margin-bottom: 2.25rem;
	}
	.back {
		border: none;
		background: none;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		cursor: pointer;
		padding: 0;
		margin-bottom: 1.75rem;
	}
	.back:hover {
		color: var(--color-accent);
	}
	.untranslated {
		font-size: 0.75rem;
		color: #d97706;
		margin: 0 0 0.75rem;
	}
	.kicker {
		margin: 0 0 0.875rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	h1 {
		margin: 0 0 0.875rem;
		font-size: clamp(2rem, 5vw, 2.875rem);
		line-height: 1.16;
		font-weight: 700;
	}
	.deck {
		margin: 0 auto 1.125rem;
		max-width: 30rem;
		font-style: italic;
		font-size: 1.0625rem;
		line-height: 1.7;
		color: var(--color-ink-muted);
	}
	.by {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.cv {
		margin: 0 0 2.5rem;
	}
	.cv img {
		width: 100%;
		height: auto;
		display: block;
	}
	/* print-editorial paradigm: drop cap + large pull quotes + generous leading */
	.pbody :global(.prose) {
		font-size: 1.125rem;
		line-height: 1.95;
	}
	.pbody :global(.prose > p:first-of-type)::first-letter {
		float: left;
		font-size: 3.4em;
		line-height: 0.86;
		padding: 0.06em 0.12em 0 0;
		font-weight: 700;
		color: var(--color-strong);
	}
	.pbody :global(.prose blockquote) {
		font-size: 1.5rem;
		line-height: 1.45;
		font-style: italic;
		text-align: center;
		color: var(--color-ink);
		border: none;
		margin: 2.5rem auto;
		max-width: 28rem;
	}
	.pbody :global(.prose h2) {
		font-size: 1.625rem;
		margin-top: 2.75rem;
	}
	.pbody :global(.prose h2)::before {
		content: '❧';
		display: block;
		text-align: center;
		font-size: 0.875rem;
		color: var(--color-accent);
		margin-bottom: 0.75rem;
	}
	.endmark {
		display: block;
		text-align: center;
		color: var(--color-accent);
		font-size: 0.875rem;
		margin: 2rem 0 0.5rem;
	}
	.tg {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-top: 1px solid var(--color-line);
		padding-top: 1.25rem;
		color: var(--color-ink-muted);
	}
	.tg a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.tg a:hover {
		color: var(--color-accent);
	}
	.book-line {
		text-align: center;
		font-size: 0.9375rem;
		font-style: italic;
		color: var(--color-ink-muted);
	}
	.book-line a {
		color: var(--color-accent);
		text-decoration: none;
	}
	.more {
		display: grid;
		gap: 1rem;
		text-align: center;
		margin: 2.25rem 0;
		padding-block: 1.5rem;
		border-block: 3px double var(--color-ink);
		font-size: 1.0625rem;
	}
	.more a {
		color: var(--color-ink);
		text-decoration: none;
		line-height: 1.5;
	}
	.more a:hover {
		color: var(--color-accent);
	}
</style>
