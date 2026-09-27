<script lang="ts">
	/**
	 * Corporate blog = "Insights" listing paradigm: quiet masthead, filter chip row
	 * (category / year / sort), editorial report rows (date column | title + summary
	 * + arrow), understated pagination. Full filter contract preserved: type/year/
	 * sort/tag/series/sonly/q/page all route through blogQuery like the base pack.
	 */
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { blogQuery } from '$lib/blog-params';
	import type { BlogProps } from '../../contracts';

	let {
		posts,
		total,
		page: pageNum,
		totalPages,
		years,
		categories,
		filter,
		query
	}: BlogProps = $props();

	const go = (over: Record<string, unknown>) =>
		href('/blog' + blogQuery({ ...filter, q: query || null, ...over }));
	const filtering = $derived(
		Boolean(filter.tag) ||
			Boolean(filter.year) ||
			Boolean(filter.type) ||
			Boolean(filter.series) ||
			filter.sonly ||
			Boolean(query) ||
			filter.sort !== 'new'
	);
</script>

<section class="insights" data-transition-passage>
	<header class="mast">
		<h1>{m.blog_title()}</h1>
		<p class="count">{m.blog_meta_desc({ count: String(total) })}</p>
	</header>

	<div class="filters" role="search" aria-label={m.blog_filters_aria()}>
		{#if categories.length > 0}
			<span class="fgroup">
				<span class="flabel">{m.blog_type_label()}</span>
				<a class="chip" class:on={!filter.type} href={go({ type: null })}>{m.blog_type_all()}</a>
				{#each categories as c (c.slug)}
					<a class="chip" class:on={filter.type === c.slug} href={go({ type: c.slug })}
						>{c.display}</a
					>
				{/each}
			</span>
		{/if}
		{#if years.length > 1}
			<span class="fgroup">
				<span class="flabel">{m.blog_year_label()}</span>
				<a class="chip" class:on={!filter.year} href={go({ year: null })}>{m.blog_year_all()}</a>
				{#each years as y (y.year)}
					<a class="chip" class:on={filter.year === y.year} href={go({ year: y.year })}>{y.year}</a>
				{/each}
			</span>
		{/if}
		<span class="fgroup">
			<span class="flabel">{m.blog_sort_label()}</span>
			<a class="chip" class:on={filter.sort === 'new'} href={go({ sort: 'new' })}
				>{m.blog_sort_new()}</a
			>
			<a class="chip" class:on={filter.sort === 'views'} href={go({ sort: 'views' })}
				>{m.blog_sort_views()}</a
			>
		</span>
		<form class="q" method="GET" action={href('/blog')}>
			<label class="hide" for="c-blog-q">{m.blog_search_label()}</label>
			<input
				id="c-blog-q"
				type="search"
				name="q"
				value={query ?? ''}
				placeholder={m.blog_search_placeholder()}
			/>
		</form>
		{#if filtering}
			<a class="reset" href="/blog">{m.blog_reset()}</a>
		{/if}
	</div>

	{#if query}
		<p class="active-q">{m.blog_search_active({ query })}</p>
	{/if}

	{#if posts.length === 0}
		<p class="empty">{m.blog_empty()}</p>
	{:else}
		<ol class="list">
			{#each posts as p (p.slug)}
				<li>
					<a class="row" href={href(`/blog/${p.slug}`)}>
						<time class="date" datetime={p.date}>{p.date.slice(0, 10)}</time>
						<span class="body">
							<span class="cat">{p.categoryDisplay}</span>
							<h2>{p.title}</h2>
							{#if p.summary}<p class="sum">{p.summary}</p>{/if}
						</span>
						<span class="arrow" aria-hidden="true">→</span>
					</a>
				</li>
			{/each}
		</ol>
	{/if}

	{#if totalPages > 1}
		<nav class="pager" aria-label="pagination">
			{#if pageNum > 1}<a href={go({ page: pageNum - 1 })}>{m.post_prev()}</a>{/if}
			<span class="pos">{pageNum} / {totalPages}</span>
			{#if pageNum < totalPages}<a href={go({ page: pageNum + 1 })}>{m.post_next()}</a>{/if}
		</nav>
	{/if}
</section>

<style>
	.insights {
		max-width: 62rem;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 1rem;
	}
	.mast {
		margin-bottom: 1.5rem;
	}
	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0 0 0.25rem;
	}
	.count {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
		padding: 1rem 0;
		border-block: 1px solid var(--color-line);
		margin-bottom: 1rem;
	}
	.fgroup {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
	}
	.flabel {
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-right: 0.25rem;
	}
	.chip {
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.chip:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}
	.chip.on {
		background: color-mix(in oklab, var(--color-accent) 14%, transparent);
		border-color: var(--color-accent);
		color: var(--color-ink);
	}
	.q {
		margin-left: auto;
	}
	.q input {
		font-size: 0.8125rem;
		padding: 0.4rem 0.7rem;
		max-width: 14rem;
	}
	.hide {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.reset {
		font-size: 0.75rem;
		color: var(--color-accent);
		text-decoration: none;
	}
	.active-q {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin: 0 0 1rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li + li {
		border-top: 1px solid var(--color-line);
	}
	.row {
		display: grid;
		grid-template-columns: 8.5rem 1fr 1.5rem;
		gap: 1.25rem;
		padding: 1.5rem 0.25rem;
		text-decoration: none;
		color: inherit;
		align-items: baseline;
	}
	.row:hover .arrow {
		color: var(--color-accent);
		transform: translateX(2px);
	}
	.date {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}
	.cat {
		display: inline-block;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-accent);
		margin-bottom: 0.35rem;
	}
	.body h2 {
		margin: 0 0 0.35rem;
		font-size: 1.1875rem;
		font-weight: 650;
		line-height: 1.35;
	}
	.sum {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.65;
		color: var(--color-ink-muted);
	}
	.arrow {
		align-self: center;
		color: var(--color-ink-muted);
		transition:
			color 0.15s ease,
			transform 0.15s ease;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		padding: 2rem 0 1rem;
		font-size: 0.8125rem;
	}
	.pager a {
		color: var(--color-ink);
		text-decoration: none;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
	}
	.pager a:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.pos {
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
		font-size: 0.75rem;
	}
	@media (max-width: 47.5rem) {
		.row {
			grid-template-columns: 1fr;
			gap: 0.35rem;
		}
		.arrow {
			display: none;
		}
	}
</style>
