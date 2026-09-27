<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { blogQuery, type BlogParams } from '$lib/blog-params';
	import { reveal } from '$lib/animation/reveal';
	import { maskReveal } from '$lib/animation/text';
	import { prefersReducedMotion } from '$lib/animation/config';
	import { ensureGsap } from '$lib/animation/core';
	import PostRow from '$lib/components/PostRow.svelte';
	import { BLOG_PAGE_SIZE } from '$lib/blog-params';
	import type { PostSummary } from '$lib/server/content';
	import { blogGrid, blogSide } from './blog-fx';
	import type { BlogProps } from '../../contracts';

	let {
		posts,
		total,
		page: pageNum,
		totalPages,
		tags,
		years,
		categories,
		series,
		filter,
		query
	}: BlogProps = $props();

	/** filter links: merge current state with override params (URL as state; q is one of the dimensions) */
	const link = (over: Partial<BlogParams>) =>
		href('/blog' + blogQuery({ ...filter, q: query || null, ...over }));

	const hasFilters = $derived(
		Boolean(filter.tag) ||
			Boolean(filter.year) ||
			Boolean(filter.type) ||
			Boolean(filter.series) ||
			filter.sonly ||
			Boolean(query) ||
			filter.sort !== 'new'
	);
	/** client-side tag filtering (pure memory: the full set is already in props; never hits the server) */
	let tagQuery = $state('');
	const filteredTags = $derived.by(() => {
		const q = tagQuery.trim().toLowerCase();
		if (!q) return tags;
		return tags.filter(
			(t) => t.name.toLowerCase().includes(q) || t.display.toLowerCase().includes(q)
		);
	});
	/** swap rebuild signature: any filter/search/page change remounts the content area (entrance animations + tilt rebound) */
	const swapSig = $derived(blogQuery({ ...filter, q: query || null, page: pageNum }));

	/* ---- 58.7 load-more: the list grows downward (pager kept; deep links/SEO unchanged) ---- */
	let extra = $state<PostSummary[]>([]);
	let loadingMore = $state(false);
	let sentinel = $state<HTMLElement>();
	const loadedCount = $derived(posts.length + extra.length);
	const canMore = $derived(loadedCount > 0 && loadedCount < total && pageNum === 1);

	$effect(() => {
		void swapSig;
		extra = [];
	});

	async function loadMore() {
		if (loadingMore || !canMore) return;
		loadingMore = true;
		try {
			const nextPage = Math.floor(loadedCount / BLOG_PAGE_SIZE) + 1;
			const res = await fetch(
				`/api/blog-more${blogQuery({ ...filter, q: query || null, page: nextPage })}`
			);
			if (res.ok) {
				const j = (await res.json()) as { posts: PostSummary[] };
				extra = [...extra, ...j.posts];
			}
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		const el = sentinel;
		if (!el || !canMore) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '400px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	// counts are state-driven (gsap only animates plain objects; text nodes always belong to Svelte — avoids textContent hijacking)
	let shownTotal = $state(total);
	const displayed = $derived(m.tag_count({ count: shownTotal }));
	let cur = total; // non-reactive current-value tracking (the effect depends only on total; prevents self-trigger loops)
	let firstRun = true;
	$effect(() => {
		const target = total;
		if (prefersReducedMotion()) {
			cur = target;
			shownTotal = target;
			return;
		}
		const start = firstRun ? 0 : cur;
		firstRun = false;
		const o = { v: start };
		cur = start;
		shownTotal = start;
		const tw = ensureGsap().to(o, {
			v: target,
			duration: start === 0 ? 1.1 : 0.55,
			ease: 'power2.out',
			onUpdate: () => {
				cur = o.v;
				shownTotal = Math.round(o.v);
			},
			onComplete: () => {
				cur = target;
				shownTotal = target;
			}
		});
		return () => tw.kill();
	});
</script>

<section class="blog-head" data-animate="blog-head">
	<p class="kicker" use:reveal={{ y: 12 }}>{m.nav_blog()}</p>
	<div class="mask-reveal">
		<h1 use:maskReveal data-animate="blog-title">{m.blog_title()}</h1>
	</div>
	<p class="count" use:reveal={{ delay: 0.15, y: 12 }}>
		{displayed}
	</p>
</section>

<div class="blog-layout">
	<aside class="blog-side" aria-label={m.blog_filters_aria()} use:blogSide>
		<div class="side-group" data-side-group>
			<h2 class="side-title">{m.blog_search_label()}</h2>
			<form class="search-form" method="get" action={href('/blog')}>
				<input
					class="search-input"
					type="search"
					name="q"
					placeholder={m.blog_search_placeholder()}
					value={query}
					maxlength={64}
					aria-label={m.blog_search_placeholder()}
				/>
				<button type="submit" class="search-go" aria-label={m.nav_search()}>⌕</button>
				{#if filter.tag}<input type="hidden" name="tag" value={filter.tag} />{/if}
				{#if filter.year}<input type="hidden" name="year" value={String(filter.year)} />{/if}
				{#if filter.sort !== 'new'}
					<input type="hidden" name="sort" value={filter.sort} />
				{/if}
			</form>
			{#if query}
				<div class="side-list">
					<a class="chip active" data-side-item href={link({ q: null, page: 1 })}
						>{m.blog_search_active({ query })} ✕</a
					>
				</div>
			{/if}
		</div>

		<div class="side-group" data-side-group>
			<h2 class="side-title">{m.blog_sort_label()}</h2>
			<div class="side-list" role="group" aria-label={m.blog_sort_label()}>
				<a
					class="chip"
					data-side-item
					class:active={filter.sort === 'new'}
					href={link({ sort: 'new', page: 1 })}>{m.blog_sort_new()}</a
				>
				<a
					class="chip"
					data-side-item
					class:active={filter.sort === 'views'}
					href={link({ sort: 'views', page: 1 })}>{m.blog_sort_views()}</a
				>
			</div>
		</div>

		<div class="side-group" data-side-group>
			<h2 class="side-title">{m.blog_type_label()}</h2>
			<ul class="side-list">
				<li>
					<a
						class="chip"
						data-side-item
						class:active={!filter.type}
						href={link({ type: null, page: 1 })}>{m.blog_type_all()}</a
					>
				</li>
				{#each categories as c (c.slug)}
					<li>
						<a
							class="chip"
							data-side-item
							class:active={filter.type === c.slug}
							href={link({ type: filter.type === c.slug ? null : c.slug, page: 1 })}
							>{c.display} <span class="chip-n">{c.count}</span></a
						>
					</li>
				{/each}
			</ul>
		</div>

		{#if series.length > 0}
			<div class="side-group" data-side-group>
				<h2 class="side-title">{m.blog_series_label()}</h2>
				<ul class="side-list">
					<li>
						<a
							class="chip"
							data-side-item
							class:active={!filter.series && !filter.sonly}
							href={link({ series: null, sonly: false, page: 1 })}>{m.blog_series_all()}</a
						>
					</li>
					{#each series as s (s.slug)}
						<li>
							<a
								class="chip"
								data-side-item
								class:active={filter.series === s.slug}
								href={link({
									series: filter.series === s.slug ? null : s.slug,
									sonly: false,
									page: 1
								})}>{s.title} <span class="chip-n">{s.count}</span></a
							>
						</li>
					{/each}
					<li>
						<a
							class="chip chip-sonly"
							data-side-item
							class:active={filter.sonly}
							href={link({ sonly: !filter.sonly, series: null, page: 1 })}
							>◈ {m.blog_sonly_label()}</a
						>
					</li>
				</ul>
			</div>
		{/if}

		{#if years.length > 1}
			<div class="side-group" data-side-group>
				<h2 class="side-title">{m.blog_year_label()}</h2>
				<ul class="side-list">
					<li>
						<a
							class="chip"
							data-side-item
							class:active={!filter.year}
							href={link({ year: null, page: 1 })}>{m.blog_year_all()}</a
						>
					</li>
					{#each years as ys (ys.year)}
						<li>
							<a
								class="chip"
								data-side-item
								class:active={filter.year === ys.year}
								href={link({ year: filter.year === ys.year ? null : ys.year, page: 1 })}
								>{ys.year} <span class="chip-n">{ys.count}</span></a
							>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if tags.length > 0}
			<div class="side-group" data-side-group>
				<h2 class="side-title">{m.nav_tags()}</h2>
				<div class="search-form tag-filter">
					<input
						class="search-input"
						type="search"
						placeholder={m.blog_tag_filter_placeholder()}
						bind:value={tagQuery}
						aria-label={m.blog_tag_filter_placeholder()}
					/>
				</div>
				<ul class="side-list tag-scroll">
					<li>
						<a
							class="chip"
							data-side-item
							class:active={!filter.tag}
							href={link({ tag: null, page: 1 })}>{m.blog_filter_all()}</a
						>
					</li>
					{#each filteredTags as tag (tag.name)}
						<li>
							<a
								class="chip"
								data-side-item
								class:active={filter.tag === tag.name}
								href={link({ tag: filter.tag === tag.name ? null : tag.name, page: 1 })}
								>#{tag.display} <span class="chip-n">{tag.count}</span></a
							>
						</li>
					{/each}
					{#if filteredTags.length === 0}
						<li class="tag-none">{m.blog_tag_none()}</li>
					{/if}
				</ul>
			</div>
		{/if}

		{#if hasFilters}
			<a class="reset" href={href('/blog')}>{m.blog_reset()}</a>
		{/if}
	</aside>

	<section class="blog-main" aria-label={m.blog_title()} data-swap-region>
		{#key swapSig}
			<ul class="post-list" style:--card-layout="1" use:blogGrid>
				{#each posts as post, i (post.slug)}
					<PostRow {post} index={i} glow />
				{:else}
					<li class="empty">{m.blog_empty()}</li>
				{/each}
				{#each extra as xpost, k (xpost.slug)}
					<PostRow post={xpost} index={posts.length + k} glow />
				{/each}
			</ul>
		{/key}

		{#if canMore || extra.length > 0}
			<div class="more-zone" bind:this={sentinel}>
				{#if canMore}
					<button
						type="button"
						class="more-btn"
						disabled={loadingMore}
						onclick={() => void loadMore()}
					>
						{loadingMore ? '…' : m.blog_more_label()}（{loadedCount}/{total}）
					</button>
				{:else}
					<p class="more-end">— {m.blog_more_end()} —</p>
				{/if}
			</div>
		{/if}

		{#if totalPages > 1}
			<nav class="pagination" aria-label={m.pagination_nav()}>
				{#if pageNum > 1}
					<a class="page-btn" href={link({ page: pageNum - 1 })}>← {m.pagination_prev()}</a>
				{:else}
					<span class="page-btn disabled" aria-disabled="true">← {m.pagination_prev()}</span>
				{/if}
				<span class="page-info">{m.pagination_page({ current: pageNum, total: totalPages })}</span>
				{#if pageNum < totalPages}
					<a class="page-btn" href={link({ page: pageNum + 1 })}>{m.pagination_next()} →</a>
				{:else}
					<span class="page-btn disabled" aria-disabled="true">{m.pagination_next()} →</span>
				{/if}
			</nav>
		{/if}
	</section>
</div>

<style>
	.blog-head {
		max-width: 90rem;
		margin: 0 auto;
		padding: clamp(4rem, 10vh, 7rem) 1.5rem 2.5rem;
	}

	.kicker {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
	}

	.blog-head h1 {
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

	/* ——— sidebar × cards two-column (exploration page widened to 90rem; content density first) ——— */
	.blog-layout {
		max-width: 90rem;
		margin: 0 auto;
		padding: 0 1.5rem clamp(3rem, 8vh, 5rem);
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		gap: 2.5rem;
		align-items: start;
	}

	@media (max-width: 1023px) {
		.blog-layout {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
	}

	.blog-side {
		position: sticky;
		top: 5.5rem;
		max-height: calc(100vh - 7rem);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--color-line) transparent;
		display: flex;
		flex-direction: column;
		gap: 1.9rem;
		padding: 1.25rem 0 1.25rem 0.25rem;
	}

	@media (max-width: 1023px) {
		.blog-side {
			position: static;
			max-height: none;
			overflow: visible;
			gap: 1.25rem;
			padding: 0;
			order: 1;
		}
	}

	.side-group {
		min-width: 0;
	}

	.side-title {
		margin: 0 0 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}

	.side-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	@media (max-width: 1023px) {
		.side-list {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		width: 100%;
		transition:
			color 0.18s ease,
			background-color 0.18s ease,
			border-color 0.18s ease;
	}

	@media (max-width: 1023px) {
		.chip {
			width: auto;
			border-color: var(--color-line);
			border-radius: 9999px;
			padding: 0.3125rem 0.75rem;
		}
	}

	.chip:hover {
		color: var(--color-strong);
		background: color-mix(in srgb, var(--color-strong) 7%, transparent);
	}

	.chip.active {
		color: var(--color-strong);
		border-color: color-mix(in srgb, var(--color-strong) 40%, transparent);
		background: color-mix(in srgb, var(--color-strong) 9%, transparent);
	}

	.chip-n {
		margin-left: auto;
		font-size: 0.6875rem;
		opacity: 0.7;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 1023px) {
		.chip-n {
			margin-left: 0.1rem;
		}
	}

	/* tag list scrolling: ~9 rows visible initially (incl. "All"); many tags never burst the sidebar */
	.tag-scroll {
		max-height: 18.5rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--color-line) transparent;
		padding-right: 0.25rem;
	}

	@media (max-width: 1023px) {
		.tag-scroll {
			max-height: 8.5rem;
			padding-right: 0;
		}
	}

	.tag-none {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		padding: 0.3rem 0.6rem;
	}

	/* embedded search: mono underlined input (matches the sidebar's text vocabulary; no pill) */
	.search-form {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border-bottom: 1px solid var(--color-line);
		padding-bottom: 0.4rem;
		transition: border-color 0.2s ease;
	}

	.search-form:focus-within {
		border-color: var(--color-strong);
	}

	.search-input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink);
		padding: 0.15rem 0;
	}

	.search-input::placeholder {
		color: var(--color-ink-muted);
		opacity: 0.75;
	}

	.search-go {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
		line-height: 1;
		padding: 0.15rem 0.1rem;
		transition: color 0.2s ease;
	}

	.search-go:hover {
		color: var(--color-strong);
	}

	.reset {
		align-self: flex-start;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		border-bottom: 1px dashed var(--color-line);
		padding-bottom: 0.1rem;
	}

	.reset:hover {
		color: var(--color-strong);
	}

	/* ——— card grid ——— */
	.blog-main {
		position: relative;
		min-width: 0;
		order: 2;
	}

	/* three-column cards on large screens (≥1366 only; below auto-falls back to two-column big cards); card-style container = this ul */
	.post-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		container-type: style;
		grid-template-columns: repeat(auto-fill, minmax(min(20rem, 100%), 1fr));
		gap: 1.25rem;
	}

	/* glow converged into card.css + cardFx (Phase 54); only title tinting remains below */

	.post-list :global(.post-row:hover .row-title) {
		color: var(--color-strong);
	}
	.post-list :global(.row-title) {
		transition: color 0.22s ease;
	}

	.empty {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		padding: 2.5rem 0;
	}

	/* ——— pagination ——— */
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

	.more-zone {
		display: flex;
		justify-content: center;
		margin: 1.75rem 0 0.5rem;
	}

	.more-btn {
		padding: 0.5rem 1.4rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		background: var(--color-bg-elevated);
		color: var(--color-strong);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.more-btn:disabled {
		opacity: 0.55;
	}

	.more-end {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
</style>
