<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { smartBack } from '$lib/smart-back';
	import { blogQuery } from '$lib/blog-params';
	import { formatDate } from '$lib/format';
	import { site } from '$lib/site';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import PostBody from '$lib/components/PostBody.svelte';
	import type { PostProps } from '../../contracts';

	let { post, adjacent, seriesBooks, basePath = '/blog', hideToc = false }: PostProps = $props();

	const man = `${site.title.toLowerCase()}(1)`.toUpperCase();

	const backOnClick = (e: MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		smartBack();
	};
</script>

<ExtensionSlot name="post.before" />

<article class="t-man">
	<p class="t-back">
		<a href={href('/blog')} onclick={backOnClick}>← {m.post_back()}</a>
	</p>
	<div class="t-man-head">
		<span class="t-man-left">{man}</span>
		<h1 class="t-man-center">{post.title}</h1>
		<span class="t-man-right">{man}</span>
	</div>

	<section class="t-sec">
		<h2 class="t-sec-h">NAME</h2>
		<p class="t-sec-b">
			<span class="t-syn">{post.slug}</span> — {post.summary}
			{#if !post.translated}<span class="t-flag">* 未翻訳（母語原文）</span>{/if}
		</p>
	</section>

	<section class="t-sec">
		<h2 class="t-sec-h">DATE</h2>
		<p class="t-sec-b t-meta">
			<time datetime={post.date}>{formatDate(post.date)}</time>
			· {m.post_minutes({ minutes: post.readingMinutes })}
			{#if post.tags.length > 0}
				· {#each post.tags as tag (tag.name)}
					<a href={href('/blog' + blogQuery({ tag: tag.name }))}>#{tag.display}</a>
				{/each}
			{/if}
		</p>
	</section>

	{#if post.cover}
		<figure class="t-cover">
			<img src={post.cover} alt={post.title} width="1200" height="630" fetchpriority="high" />
		</figure>
	{/if}

	{#if post.toc.length > 0 && !hideToc}
		<section class="t-sec">
			<h2 class="t-sec-h">CONTENTS</h2>
			<ul class="t-toc">
				{#each post.toc as item (item.id)}
					<li class:depth-3={item.depth === 3}><a href="#{item.id}">{item.text}</a></li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="t-sec t-desc">
		<h2 class="t-sec-h">DESCRIPTION</h2>
		<PostBody html={post.contentHtml} />
	</section>

	{#if seriesBooks && seriesBooks.length > 0}
		<p class="t-series-line">
			<span class="t-prompt">#</span>
			{m.series_in_book()}
			{#each seriesBooks as bk, i (bk.slug)}
				{#if i > 0}
					·
				{/if}<a href={href(`/series/${bk.slug}`)}>《{bk.slug}》</a>
			{/each}
		</p>
	{/if}

	{#if adjacent.prev || adjacent.next}
		<div class="t-pager">
			{#if adjacent.prev}
				<a href={href(`${basePath}/${adjacent.prev.slug}`)}>$ less {adjacent.prev.slug}</a>
			{:else}
				<span></span>
			{/if}
			{#if adjacent.next}
				<a href={href(`${basePath}/${adjacent.next.slug}`)}>$ less {adjacent.next.slug}</a>
			{:else}
				<span></span>
			{/if}
		</div>
	{/if}

	<CommentSection slug={post.slug} />
</article>

<ExtensionSlot name="post.after" />

<style>
	.t-man {
		max-width: 68rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vh, 3.5rem) 1.25rem 0;
		font-family: var(--font-mono);
	}

	.t-man-head {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		border-bottom: 1px solid var(--color-line);
		padding-bottom: 0.4rem;
		letter-spacing: 0.04em;
	}

	.t-man-center {
		color: var(--color-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40ch;
	}

	.t-man-right {
		text-align: right;
	}

	.t-sec {
		margin-top: 1.75rem;
	}

	.t-sec-h {
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		color: var(--color-strong);
		margin: 0 0 0.5rem;
		font-weight: 700;
	}

	.t-sec-b {
		font-size: 0.9rem;
		color: var(--color-ink);
		margin: 0;
		line-height: 1.7;
	}

	.t-syn {
		color: var(--color-strong);
	}

	.t-flag {
		color: var(--color-ink-muted);
		font-size: 0.8rem;
	}

	.t-meta {
		color: var(--color-ink-muted);
	}

	.t-meta a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-cover {
		margin: 1.75rem 0 0;
	}

	.t-cover img {
		width: 100%;
		height: auto;
		border: 1px solid var(--color-line);
	}

	.t-toc {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.85rem;
	}

	.t-toc a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-toc a:hover {
		color: var(--color-strong);
	}

	.t-toc .depth-3 {
		padding-left: 1.5rem;
	}

	.t-desc {
		margin-top: 2.25rem;
	}

	.t-pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 2.5rem;
		border-top: 1px solid var(--color-line);
		padding-top: 1rem;
		font-size: 0.85rem;
	}

	.t-pager a {
		color: var(--color-ink-muted);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 48%;
	}

	.t-pager a:hover {
		color: var(--color-strong);
	}

	.t-series-line {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin: 1.5rem 0 0.5rem;
	}

	.t-series-line a {
		color: var(--color-strong);
		text-decoration: none;
	}

	.t-series-line a:hover {
		text-decoration: underline;
	}
</style>
