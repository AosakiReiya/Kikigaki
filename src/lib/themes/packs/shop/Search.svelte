<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { blogQuery } from '$lib/blog-params';
	import { reveal } from '$lib/animation/reveal';
	import { maskReveal } from '$lib/animation/text';
	import { stagger } from '$lib/animation/stagger';
	import type { SearchProps } from '../../contracts';

	let { query, results, total, page: pageNum, totalPages }: SearchProps = $props();

	/** result-page links (keep q, change page number only) */
	const link = (page: number) =>
		href(`/search?q=${encodeURIComponent(query)}${page > 1 ? `&page=${page}` : ''}`);
</script>

<section class="search-head" data-animate="search-head">
	<p class="kicker" use:reveal={{ y: 12 }}>{m.nav_search()}</p>
	<div class="mask-reveal">
		<h1 use:maskReveal data-animate="search-title">
			{#if query}
				{m.search_results_for({ query })}
			{:else}
				{m.search_title()}
			{/if}
		</h1>
	</div>
	{#if query}
		<p class="count" use:reveal={{ delay: 0.15, y: 12 }}>
			{m.tag_count({ count: total })}
		</p>
		<p class="to-blog">
			<a href={href('/blog' + blogQuery({ q: query }))}>{m.search_try_blog()}</a>
		</p>
	{/if}
</section>

<section class="search-body" aria-label={m.nav_search()}>
	{#if !query}
		<p class="prompt">{m.search_prompt()}</p>
	{:else if results.length === 0}
		<p class="empty">{m.search_empty({ query })}</p>
		<p class="hint">
			<a href={href('/blog')}>{m.blog_see_all()} →</a>
		</p>
	{:else}
		<!-- {#key}: a new query = remount the ul so use:stagger re-runs (58.x gap: re-search had no entrance) -->
		{#key query}
			<ul class="results" use:stagger={{ target: 'li' }}>
				{#each results as r (r.post.slug)}
					<li>
						<a class="hit" href={href(`/blog/${r.post.slug}`)}>
							<span class="hit-main">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- highlightHtml escapes everything first; only <mark> is injected -->
								<span class="hit-title">{@html r.titleHtml}</span>
								{#if r.post.summary}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									<span class="hit-summary">{@html r.summaryHtml}</span>
								{/if}
							</span>
							<span class="hit-meta">
								<time class="hit-date" datetime={r.post.date}>{r.post.date}</time>
								<span class="hit-tags" aria-label={m.nav_tags()}>
									{#each r.post.tags.slice(0, 2) as tag (tag.name)}
										<span class="tag">#{tag.display}</span>
									{/each}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/key}

		{#if totalPages > 1}
			<nav class="pagination" aria-label={m.pagination_nav()}>
				{#if pageNum > 1}
					<a class="page-btn" href={link(pageNum - 1)}>← {m.pagination_prev()}</a>
				{:else}
					<span class="page-btn disabled" aria-disabled="true">← {m.pagination_prev()}</span>
				{/if}
				<span class="page-info">{m.pagination_page({ current: pageNum, total: totalPages })}</span>
				{#if pageNum < totalPages}
					<a class="page-btn" href={link(pageNum + 1)}>{m.pagination_next()} →</a>
				{:else}
					<span class="page-btn disabled" aria-disabled="true">{m.pagination_next()} →</span>
				{/if}
			</nav>
		{/if}
	{/if}
</section>

<style>
	.search-head {
		max-width: 60rem;
		margin: 0 auto;
		padding: clamp(4rem, 10vh, 6rem) 1.5rem 2.5rem;
	}

	.kicker {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
	}

	.search-head h1 {
		font-size: var(--text-h1);
		font-weight: 700;
		color: var(--color-ink);
	}

	.count {
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.to-blog {
		margin-top: 0.5rem;
	}

	.to-blog a {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		border-bottom: 1px dashed var(--color-line);
		padding-bottom: 0.1rem;
	}

	.to-blog a:hover {
		color: var(--color-strong);
	}

	.search-body {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1.5rem clamp(3rem, 8vh, 5rem);
	}

	.prompt,
	.empty {
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		color: var(--color-ink-muted);
		padding: 2rem 0;
	}

	.hint {
		text-align: center;
		padding-bottom: 2rem;
	}

	.hint a {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-strong);
		text-decoration: none;
	}

	.results {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.hit {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.5rem 1rem;
		border-top: 1px solid var(--color-line);
		text-decoration: none;
		transition: background-color 0.25s ease;
	}

	.results li:last-child .hit {
		border-bottom: 1px solid var(--color-line);
	}

	.hit:hover {
		background-color: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}

	.hit:hover .hit-title {
		color: var(--color-strong);
	}

	.hit-main {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.hit-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-ink);
		transition: color 0.22s ease;
		overflow-wrap: anywhere;
	}

	.hit-summary {
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.hit :global(mark) {
		background: color-mix(in srgb, var(--color-strong) 22%, transparent);
		color: var(--color-strong);
		padding: 0 0.1em;
		border-radius: 0.2em;
	}

	.hit-meta {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.hit-date {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.hit-tags {
		display: flex;
		gap: 0.75rem;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.tag:hover {
		color: var(--color-strong);
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 2.5rem;
	}

	.page-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.875rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink);
		text-decoration: none;
		transition:
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.page-btn:hover {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}

	.page-btn.disabled {
		opacity: 0.4;
		pointer-events: none;
	}

	.page-info {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
