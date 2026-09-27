<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { smartBack } from '$lib/smart-back';
	import { blogQuery } from '$lib/blog-params';
	import { formatDate } from '$lib/format';
	import { reveal } from '$lib/animation/reveal';
	import { maskReveal } from '$lib/animation/text';
	import { progressBar } from '$lib/animation/scroll';
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

	let tocEl = $state<HTMLElement>();

	/** back = return where you came from (modifier/middle-click lets the browser take the href fallback) */
	const backOnClick = (e: MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		smartBack();
	};

	let bodyEl = $state<HTMLElement>();
	let spy = $state<SpyState>({ id: null, progress: 0, idx: -1, total: 0, overall: 0 });
	$effect(() => {
		const root = bodyEl;
		if (!root || post.toc.length === 0) return;
		return scrollSpy(root, (s) => (spy = s));
	});
</script>

<ExtensionSlot name="post.before" />

<div class="reading-progress" aria-hidden="true">
	<div class="bar" use:progressBar data-progress-bar></div>
</div>

<article class:flush data-animate="article">
	<header class="article-head" data-animate="article-head">
		<a class="back" href={href('/blog')} onclick={backOnClick}>← {m.post_back()}</a>
		{#if !post.translated}
			<p class="untranslated" role="note">{m.post_untranslated()}</p>
		{/if}
		<div class="mask-reveal">
			<h1
				use:maskReveal
				data-flip-id="post-{post.slug}"
				data-animate="article-title"
				data-swap-focus
				tabindex="-1"
			>
				{post.title}
			</h1>
		</div>
		<p class="post-meta" use:reveal={{ delay: 0.15, y: 12 }}>
			<time datetime={post.date}>{formatDate(post.date)}</time>
			<span aria-hidden="true">·</span>
			<span>{m.post_minutes({ minutes: post.readingMinutes })}</span>
			{#if post.tags.length > 0}
				<span aria-hidden="true">·</span>
				{#each post.tags as tag (tag.name)}
					<a class="post-tag" href={href('/blog' + blogQuery({ tag: tag.name }))}>#{tag.display}</a>
				{/each}
			{/if}
		</p>
	</header>

	{#if post.cover}
		<figure
			class="cover"
			use:reveal={{ y: 32 }}
			data-flip-id="cover-{post.slug}"
			data-animate="article-cover"
		>
			<img src={post.cover} alt={post.title} width="1200" height="630" fetchpriority="high" />
		</figure>
	{/if}

	<div class="article-body" bind:this={bodyEl}>
		<PostBody html={post.contentHtml} />

		{#if post.toc.length > 0 && !hideToc}
			<nav class="toc" bind:this={tocEl} use:reveal={{ y: 16 }} aria-label={m.post_toc()}>
				<p class="toc-title">{m.post_toc()}</p>
				<ul>
					{#each post.toc as item (item.id)}
						<li class:depth-3={item.depth === 3} class:now={spy.id === item.id}>
							<a href="#{item.id}">{item.text}</a>
							{#if spy.id === item.id}
								<span class="sub-track"><i style={`--p:${spy.progress}`}></i></span>
							{/if}
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</div>
</article>

<ExtensionSlot name="post.after" />

{#if post.toc.length > 0 && !hideToc}
	<TocFab items={post.toc} inline={tocEl} />
{/if}

{#if seriesBooks && seriesBooks.length > 0}
	<p class="book-line">
		{#each seriesBooks as bk, i (bk.slug)}
			{#if i > 0}
				·
			{/if}{m.series_in_book()}
			<a class="book-line-link" href={href(`/series/${bk.slug}`)}
				>《{bk.title}》→ {m.series_read_book()}</a
			>
		{/each}
	</p>
{/if}

{#if adjacent.prev || adjacent.next}
	<nav class="adjacent" aria-label={m.adjacent_nav()}>
		{#if adjacent.prev}
			<a class="adjacent-cell" href={href(`${basePath}/${adjacent.prev.slug}`)} data-dir="prev">
				<span class="adjacent-label">← {m.post_prev()}</span>
				<span class="adjacent-title">{adjacent.prev.title}</span>
			</a>
		{:else}
			<span class="adjacent-cell empty"></span>
		{/if}
		{#if adjacent.next}
			<a class="adjacent-cell" href={href(`${basePath}/${adjacent.next.slug}`)} data-dir="next">
				<span class="adjacent-label">{m.post_next()} →</span>
				<span class="adjacent-title">{adjacent.next.title}</span>
			</a>
		{:else}
			<span class="adjacent-cell empty"></span>
		{/if}
	</nav>
{/if}

<CommentSection slug={post.slug} />

<style>
	.reading-progress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		z-index: 60;
		pointer-events: none;
	}

	.bar {
		height: 100%;
		width: 100%;
		background-color: var(--color-accent);
		transform: scaleX(0);
		transform-origin: left;
	}

	article {
		max-width: 80rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vh, 6rem) 1.5rem 0;
	}

	.back {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		margin-bottom: 2.5rem;
		transition: color 0.2s ease;
	}

	.back:hover {
		color: var(--color-ink);
	}

	.untranslated {
		margin: 0 0 1.5rem;
		padding: 0.625rem 0.875rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}

	.article-head {
		max-width: 52rem;
	}

	.article-head h1 {
		font-size: var(--text-h1);
		font-weight: 700;
		color: var(--color-ink);
	}

	.post-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.post-tag {
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.post-tag:hover {
		color: var(--color-ink);
	}

	.cover {
		margin: 3rem 0 0;
	}

	.cover img {
		width: 100%;
		height: auto;
		border-radius: 1.25rem;
		border: 1px solid var(--color-line);
	}

	/* inside the book shell (flush): 52rem reading width centered — side margins match standalone post pages */
	article.flush {
		max-width: 52rem;
		margin-inline: auto;
		padding-inline: 0;
	}

	article.flush .article-head {
		max-width: none;
	}

	article.flush {
		--body-cols: minmax(0, 1fr);
	}

	/* the typography plugin's .prose default 65ch: inside books the column controls width itself; lifted */
	article.flush :global(.prose) {
		max-width: none;
	}

	.article-body {
		display: grid;
		grid-template-columns: var(--body-cols, minmax(0, 65ch) minmax(0, 1fr));
		gap: clamp(2rem, 6vw, 5rem);
		margin-top: 3rem;
	}

	.toc {
		position: sticky;
		top: 5rem;
		align-self: start;
		font-size: 0.875rem;
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
	}

	.toc-title {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
	}

	/* max-content: list width = longest title; track/highlight/bar all align to it
	   (however wide the right column gets on large screens, the bar never bursts) — zero JS */
	.toc ul {
		width: max-content;
		max-width: 100%;
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border-left: 1px solid var(--color-line);
	}

	/* 58.13-fix: keep the beloved old vocabulary — moved-to / current section's left line lights up */
	.toc li {
		position: relative;
		padding-left: 1rem;
		margin-left: -1px;
		border-left: 1px solid transparent;
		transition: border-color 0.2s ease;
	}

	.toc li:hover {
		border-left-color: var(--color-strong);
	}

	.toc li.now {
		border-left-color: var(--color-strong);
	}

	.toc li.now a {
		position: relative;
		display: inline-block;
		color: var(--color-strong);
		font-weight: 600;
	}

	/* full-width bar: hung on the li instead of <a>; no longer scales with title length */
	.toc .sub-track {
		left: 1rem;
		right: 0;
		bottom: -0.15rem;
	}

	.sub-track {
		position: absolute;
		bottom: -0.1rem;
		left: 0;
		right: 0;
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

	.toc li.depth-3 {
		padding-left: 2rem;
	}

	.toc a {
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.toc a:hover {
		color: var(--color-ink);
	}

	/* --- adjacent posts --- */
	.adjacent {
		max-width: 80rem;
		margin: clamp(4rem, 10vh, 7rem) auto 0;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-top: 1px solid var(--color-line);
	}

	.adjacent-cell {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 2rem 1rem;
		text-decoration: none;
		transition: background-color 0.25s ease;
	}

	.adjacent-cell[data-dir='next'] {
		align-items: flex-end;
		text-align: right;
		border-left: 1px solid var(--color-line);
	}

	.adjacent-cell:hover {
		background-color: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}

	.adjacent-cell.empty {
		pointer-events: none;
	}

	.adjacent-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.adjacent-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	@media (max-width: 1023px) {
		.article-body {
			grid-template-columns: minmax(0, 1fr);
		}

		.toc {
			position: static;
			order: -1;
			max-height: none;
			margin-bottom: 1rem;
		}
	}

	@media (max-width: 767px) {
		.adjacent {
			grid-template-columns: 1fr;
		}

		.adjacent-cell[data-dir='next'] {
			align-items: flex-start;
			text-align: left;
			border-left: none;
			border-top: 1px solid var(--color-line);
		}
	}

	.series-banner {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		max-width: 46rem;
		margin: 1.25rem auto 0;
		padding: 0 1.5rem;
	}

	.series-chip-pos {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-strong);
	}

	.book-line {
		max-width: 46rem;
		margin: 1.25rem auto 0;
		padding: 0 1.5rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.book-line-link {
		color: var(--color-strong);
		text-decoration: none;
		border-bottom: 1px dotted color-mix(in oklab, var(--color-strong) 50%, transparent);
	}

	.book-line-link:hover {
		border-bottom-style: solid;
	}
</style>
