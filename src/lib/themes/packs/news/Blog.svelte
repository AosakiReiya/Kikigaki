<script lang="ts">
	/**
	 * Newsroom blog: newspaper index — dense main wire (headline + standfirst,
	 * hairline rules, no cards) plus a right rail: Most Read (views-sorted from
	 * the loaded page — data already in PostSummary.views), Topics cloud, Years.
	 * Full blogQuery filter contract preserved (type/year/sort/tag/series/sonly/q/page).
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
		tags,
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
	const mostRead = $derived([...posts].sort((a, b) => b.views - a.views).slice(0, 5));
</script>

<section class="nblog" data-transition-passage>
	<header class="nb-mast">
		<h1>{m.blog_title()}</h1>
		<span class="nb-count">{m.blog_meta_desc({ count: String(total) })}</span>
	</header>

	<div class="nb-filters" role="search" aria-label={m.blog_filters_aria()}>
		{#if categories.length > 0}
			<span class="fgroup">
				<span class="flabel">{m.blog_type_label()}</span>
				<a class="fchip" class:on={!filter.type} href={go({ type: null })}>{m.blog_type_all()}</a>
				{#each categories as c (c.slug)}
					<a class="fchip" class:on={filter.type === c.slug} href={go({ type: c.slug })}
						>{c.display}</a
					>
				{/each}
			</span>
		{/if}
		{#if years.length > 1}
			<span class="fgroup">
				<span class="flabel">{m.blog_year_label()}</span>
				<a class="fchip" class:on={!filter.year} href={go({ year: null })}>{m.blog_year_all()}</a>
				{#each years as y (y.year)}
					<a class="fchip" class:on={filter.year === y.year} href={go({ year: y.year })}>{y.year}</a
					>
				{/each}
			</span>
		{/if}
		<span class="fgroup">
			<span class="flabel">{m.blog_sort_label()}</span>
			<a class="fchip" class:on={filter.sort === 'new'} href={go({ sort: 'new' })}
				>{m.blog_sort_new()}</a
			>
			<a class="fchip" class:on={filter.sort === 'views'} href={go({ sort: 'views' })}
				>{m.blog_sort_views()}</a
			>
		</span>
		<form class="nb-q" method="GET" action={href('/blog')}>
			<label class="hide" for="n-blog-q">{m.blog_search_label()}</label>
			<input
				id="n-blog-q"
				type="search"
				name="q"
				value={query ?? ''}
				placeholder={m.blog_search_placeholder()}
			/>
		</form>
		{#if filtering}<a class="reset" href="/blog">{m.blog_reset()}</a>{/if}
	</div>

	{#if query}<p class="active-q">{m.blog_search_active({ query })}</p>{/if}

	<div class="nb-cols">
		<main>
			{#if posts.length === 0}
				<p class="empty">{m.blog_empty()}</p>
			{:else}
				<ol class="wire">
					{#each posts as p (p.slug)}
						<li>
							<a href={href(`/blog/${p.slug}`)}>
								{#if p.cover}<img
										src={p.cover}
										alt=""
										width="240"
										height="126"
										loading="lazy"
									/>{/if}
								<span class="txt">
									<span class="cat">{p.categoryDisplay}</span>
									<h2>{p.title}</h2>
									{#if p.summary}<p>{p.summary}</p>{/if}
									<span class="meta">{p.date.slice(0, 10)} · {m.blog_more_label()}</span>
								</span>
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
		</main>

		<aside class="rail">
			{#if mostRead.length}
				<section>
					<h2 class="rail-h" data-accent>{m.blog_sort_views()}</h2>
					<ol class="mr">
						{#each mostRead as p, i (p.slug)}
							<li>
								<span class="mr-n">{i + 1}</span>
								<a href={href(`/blog/${p.slug}`)}>{p.title}</a>
							</li>
						{/each}
					</ol>
				</section>
			{/if}
			{#if tags.length}
				<section>
					<h2 class="rail-h">{m.home_tags()}</h2>
					<p class="tp">
						{#each tags.slice(0, 14) as t (t.name)}
							<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
						{/each}
					</p>
				</section>
			{/if}
			<a class="rail-about" href={href('/about')}>{m.nav_about()} →</a>
		</aside>
	</div>
</section>

<style>
	.nblog {
		max-width: 78rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 1rem;
	}
	.nb-mast {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		padding-bottom: 0.75rem;
		border-bottom: 3px solid var(--color-ink);
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.75rem;
		margin: 0;
	}
	.nb-count {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
	.nb-filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.25rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-line);
		font-size: 0.75rem;
	}
	.fgroup {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		flex-wrap: wrap;
	}
	.flabel {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.fchip {
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.25rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.fchip:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}
	.fchip.on {
		background: var(--color-ink);
		color: var(--color-bg);
		border-color: var(--color-ink);
	}
	.nb-q {
		margin-left: auto;
	}
	.nb-q input {
		font-size: 0.75rem;
		padding: 0.3rem 0.6rem;
		max-width: 12rem;
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
		margin: 0.75rem 0 0;
	}
	.nb-cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		gap: 2.5rem;
		align-items: start;
		margin-top: 1.25rem;
	}
	.wire {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.wire li + li {
		border-top: 1px solid var(--color-line);
	}
	.wire a {
		display: flex;
		gap: 1.125rem;
		padding: 1.25rem 0.25rem;
		text-decoration: none;
		color: inherit;
		align-items: flex-start;
	}
	.wire img {
		width: 9rem;
		height: 4.75rem;
		object-fit: cover;
		border-radius: 0.25rem;
		flex: none;
		border: 1px solid var(--color-line);
	}
	.txt {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	.cat {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.wire h2 {
		margin: 0;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.25rem;
		line-height: 1.3;
	}
	.wire p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
	.wire a:hover h2 {
		color: var(--color-accent);
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
		gap: 1rem;
		padding: 1.25rem 0;
		font-size: 0.75rem;
	}
	.pager a {
		color: var(--color-ink);
		text-decoration: none;
		padding: 0.3rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.25rem;
	}
	.pager a:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.pos {
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
	.rail {
		display: grid;
		gap: 1.75rem;
		position: sticky;
		top: 9rem;
		padding-left: 1.25rem;
		border-left: 1px solid var(--color-line);
	}
	.rail-h {
		margin: 0 0 0.625rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding-bottom: 0.375rem;
		border-bottom: 1px solid var(--color-ink);
	}
	.rail-h[data-accent] {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
	.mr {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.mr li {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.mr-n {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--color-accent);
		min-width: 1.125rem;
	}
	.mr a {
		font-size: 0.8125rem;
		line-height: 1.45;
		color: var(--color-ink);
		text-decoration: none;
	}
	.mr a:hover {
		color: var(--color-accent);
	}
	.tp {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin: 0;
		font-size: 0.75rem;
	}
	.tp a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.tp a:hover {
		color: var(--color-accent);
	}
	.rail-about {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-accent);
		text-decoration: none;
	}
	@media (max-width: 62rem) {
		.nb-cols {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
			border-left: none;
			padding-left: 0;
			border-top: 1px solid var(--color-line);
			padding-top: 1.25rem;
		}
	}
</style>
