<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	/**
	 * Magazine home: cover story (full-bleed latest with overlay serif headline)
	 * → table of contents (numbered feature list) → topics. Print anatomy, warm
	 * paper palette from tokens. Props contract identical to base pack.
	 */
	import { page } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import type { HomeProps } from '../../contracts';

	let { posts, tags }: HomeProps = $props();

	const settings = $derived(page.data.settings);
	const currentLocale = getLocale();
	const tagline = $derived((settings?.slogans?.[currentLocale] ?? '').trim() || m.site_tagline());
	const cover = $derived(posts[0]);
	const toc = $derived(posts.slice(1, 8));
	const issue = $derived(
		new Date().toLocaleDateString(currentLocale, { year: 'numeric', month: 'long' })
	);
</script>

<ExtensionSlot name="home.hero" />

<section class="mg-home" data-transition-passage>
	{#if cover}
		<a class="cover" href={href(`/blog/${cover.slug}`)}>
			{#if cover.cover}<img
					src={cover.cover}
					alt=""
					fetchpriority="high"
					width="1200"
					height="630"
				/>{/if}
			<span class="overlay">
				<span class="issue">{m.home_pinned()} — {issue}</span>
				<h1>{cover.title}</h1>
				{#if cover.summary}<p>{cover.summary}</p>{/if}
				<span class="date">{cover.date.slice(0, 10)}</span>
			</span>
		</a>
	{/if}

	<section class="contents">
		<h2 class="ch">{m.home_posts()}<span>{tagline}</span></h2>
		<ol class="toc">
			{#each toc as p, i (p.slug)}
				<li>
					<span class="num">{String(i + 2).padStart(2, '0')}</span>
					<a href={href(`/blog/${p.slug}`)}>
						<h3>{p.title}</h3>
						{#if p.summary}<p>{p.summary}</p>{/if}
					</a>
					<span class="pg">{p.categoryDisplay}</span>
				</li>
			{/each}
		</ol>
	</section>

	{#if tags.length}
		<p class="topics">
			<span class="tl">{m.home_tags()}</span>
			{#each tags as t (t.name)}
				<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
			{/each}
		</p>
	{/if}
</section>

<style>
	.mg-home {
		max-width: 58rem;
		margin: 0 auto;
		padding: 2.25rem 1.5rem 1rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
	}
	.cover {
		position: relative;
		display: block;
		text-decoration: none;
		color: #fff;
		margin-bottom: 3.25rem;
		border-bottom: 1px solid var(--color-ink);
	}
	.cover img {
		width: 100%;
		height: clamp(16rem, 46vw, 26rem);
		object-fit: cover;
		display: block;
	}
	.overlay {
		display: grid;
		gap: 0.625rem;
		padding: 1.5rem 0.25rem;
		color: var(--color-ink);
	}
	.issue {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.cover h1 {
		margin: 0;
		font-size: clamp(2rem, 5.5vw, 3.25rem);
		line-height: 1.12;
		font-weight: 700;
	}
	.overlay p {
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
		font-style: italic;
	}
	.date {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.cover:hover h1 {
		color: var(--color-strong);
	}
	.ch {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin: 0 0 1.25rem;
		font-size: 1.125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding-bottom: 0.625rem;
		border-bottom: 3px double var(--color-ink);
	}
	.ch span {
		font-size: 0.75rem;
		font-weight: 400;
		font-style: italic;
		color: var(--color-ink-muted);
		font-family: inherit;
	}
	.toc {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.toc li {
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr) 7rem;
		gap: 1.25rem;
		align-items: baseline;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--color-line);
	}
	.num {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-accent);
		font-weight: 700;
	}
	.toc a {
		text-decoration: none;
		color: inherit;
	}
	.toc h3 {
		margin: 0 0 0.25rem;
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1.3;
	}
	.toc p {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
		font-style: italic;
	}
	.toc a:hover h3 {
		text-decoration: underline;
		text-underline-offset: 0.25em;
	}
	.pg {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		text-align: right;
	}
	.topics {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.75rem;
		margin: 2.5rem 0 0;
		padding-top: 1rem;
		border-top: 1px solid var(--color-line);
		font-size: 0.8125rem;
	}
	.tl {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.topics a {
		color: var(--color-ink);
		text-decoration: none;
		font-style: italic;
	}
	.topics a:hover {
		color: var(--color-accent);
	}
	@media (max-width: 47.5rem) {
		.toc li {
			grid-template-columns: 2rem 1fr;
		}
		.pg {
			display: none;
		}
	}
</style>
