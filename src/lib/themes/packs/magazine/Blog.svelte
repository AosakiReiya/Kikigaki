<script lang="ts">
	/**
	 * Magazine blog: issue contents page — numbered entries (01, 02, …), big
	 * serif titles, italic standfirsts, double-rule column foot. Filter
	 * contract complete via blogQuery (type/year/sort/tag/series/sonly/q/page).
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

<section class="mg-blog" data-transition-passage>
	<header class="mb-head">
		<h1>{m.blog_title()}</h1>
		<span class="cnt">{m.blog_meta_desc({ count: String(total) })}</span>
	</header>

	<div class="mb-filters" role="search" aria-label={m.blog_filters_aria()}>
		{#if categories.length > 0}
			<span class="fg">
				<span class="fl">{m.blog_type_label()}</span>
				<a class="fc" class:on={!filter.type} href={go({ type: null })}>{m.blog_type_all()}</a>
				{#each categories as c (c.slug)}
					<a class="fc" class:on={filter.type === c.slug} href={go({ type: c.slug })}>{c.display}</a
					>
				{/each}
			</span>
		{/if}
		{#if years.length > 1}
			<span class="fg">
				<span class="fl">{m.blog_year_label()}</span>
				<a class="fc" class:on={!filter.year} href={go({ year: null })}>{m.blog_year_all()}</a>
				{#each years as y (y.year)}
					<a class="fc" class:on={filter.year === y.year} href={go({ year: y.year })}>{y.year}</a>
				{/each}
			</span>
		{/if}
		<span class="fg">
			<span class="fl">{m.blog_sort_label()}</span>
			<a class="fc" class:on={filter.sort === 'new'} href={go({ sort: 'new' })}
				>{m.blog_sort_new()}</a
			>
			<a class="fc" class:on={filter.sort === 'views'} href={go({ sort: 'views' })}
				>{m.blog_sort_views()}</a
			>
		</span>
		<form class="fq" method="GET" action={href('/blog')}>
			<label class="hide" for="m-blog-q">{m.blog_search_label()}</label>
			<input
				id="m-blog-q"
				type="search"
				name="q"
				value={query ?? ''}
				placeholder={m.blog_search_placeholder()}
			/>
		</form>
		{#if filtering}<a class="reset" href="/blog">{m.blog_reset()}</a>{/if}
	</div>

	{#if query}<p class="aq">{m.blog_search_active({ query })}</p>{/if}

	{#if posts.length === 0}
		<p class="empty">{m.blog_empty()}</p>
	{:else}
		<ol class="toc">
			{#each posts as p, i (p.slug)}
				<li>
					<span class="num">{String((pageNum - 1) * 12 + i + 1).padStart(2, '0')}</span>
					<a class="entry" href={href(`/blog/${p.slug}`)}>
						<h2>{p.title}</h2>
						{#if p.summary}<p>{p.summary}</p>{/if}
						<span class="meta">{p.categoryDisplay} · {p.date.slice(0, 10)}</span>
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
	.mg-blog {
		max-width: 54rem;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 1rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
	}
	.mb-head {
		text-align: center;
		padding-bottom: 1rem;
		border-bottom: 3px double var(--color-ink);
		margin-bottom: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 2rem;
		letter-spacing: 0.02em;
	}
	.cnt {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.mb-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.25rem;
		padding: 0.5rem 0 1rem;
		font-size: 0.75rem;
		font-family: var(--font-mono);
	}
	.fg {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
	}
	.fl {
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.fc {
		color: var(--color-ink-muted);
		text-decoration: none;
		padding-bottom: 0.05rem;
		border-bottom: 1px solid transparent;
	}
	.fc:hover {
		color: var(--color-ink);
	}
	.fc.on {
		color: var(--color-accent);
		border-bottom-color: var(--color-accent);
		font-weight: 700;
	}
	.fq {
		margin-left: auto;
	}
	.fq input {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		padding: 0.25rem 0.55rem;
		max-width: 11rem;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--color-line);
		border-radius: 0;
	}
	.hide {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.reset {
		color: var(--color-accent);
		text-decoration: none;
	}
	.aq {
		font-size: 0.8125rem;
		font-style: italic;
		color: var(--color-ink-muted);
		margin: 0 0 0.75rem;
	}
	.toc {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.toc li {
		display: grid;
		grid-template-columns: 3.25rem minmax(0, 1fr);
		gap: 1.25rem;
		padding: 1.75rem 0;
		border-bottom: 1px solid var(--color-line);
	}
	.num {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--color-accent);
		padding-top: 0.5rem;
	}
	.entry {
		text-decoration: none;
		color: inherit;
		display: block;
	}
	.entry h2 {
		margin: 0 0 0.375rem;
		font-size: 1.625rem;
		line-height: 1.25;
		font-weight: 700;
	}
	.entry p {
		margin: 0 0 0.5rem;
		font-size: 0.9375rem;
		line-height: 1.65;
		font-style: italic;
		color: var(--color-ink-muted);
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.entry:hover h2 {
		text-decoration: underline;
		text-underline-offset: 0.22em;
	}
	.empty {
		padding: 3rem 0;
		text-align: center;
		font-style: italic;
		color: var(--color-ink-muted);
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		padding: 2rem 0 1rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.pager a {
		color: var(--color-ink);
		text-decoration: none;
		border-bottom: 1px solid var(--color-ink);
		padding-bottom: 0.1rem;
	}
	.pager a:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
	.pos {
		color: var(--color-ink-muted);
	}
</style>
