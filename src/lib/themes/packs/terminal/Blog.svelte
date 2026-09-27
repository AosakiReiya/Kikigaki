<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { formatDate } from '$lib/format';
	import { blogQuery, BLOG_PAGE_SIZE, type BlogParams } from '$lib/blog-params';
	import type { PostSummary } from '$lib/server/content';
	import type { BlogProps } from '../../contracts';

	let {
		posts,
		total,
		page,
		totalPages,
		tags,
		years,
		categories,
		series,
		filter,
		query
	}: BlogProps = $props();

	const link = (over: Partial<BlogParams>) =>
		href('/blog' + blogQuery({ ...filter, q: query || null, ...over }));

	/* 58.7 load-more (same vocabulary as abstract; the EOF gag) */
	let extra = $state<PostSummary[]>([]);
	let loadingMore = $state(false);
	let sentinel = $state<HTMLElement>();
	const swapSig = $derived(blogQuery({ ...filter, q: query || null, page }));
	const loadedCount = $derived(posts.length + extra.length);
	const canMore = $derived(loadedCount > 0 && loadedCount < total && page === 1);
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
			(es) => {
				if (es.some((e) => e.isIntersecting)) void loadMore();
			},
			{ rootMargin: '400px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});

	/** ls command-line prompt (reflects the current filters) */
	const cmd = $derived(
		[
			'$ ls ~/posts',
			filter.tag ? `--grep '#${filter.tag}'` : '',
			filter.year ? `--year ${filter.year}` : '',
			filter.sort === 'views' ? '--sort=size' : '--sort=time',
			query ? `| grep "${query}"` : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<section class="t-blog" data-swap-region>
	<h1 class="t-cmd-head">{cmd}</h1>
	<p class="t-count"># {m.tag_count({ count: total })}</p>

	<form class="t-grep" method="get" action={href('/blog')}>
		<span class="t-prompt" aria-hidden="true">&gt;</span>
		<input
			type="search"
			name="q"
			placeholder={m.blog_search_placeholder()}
			value={query}
			maxlength={64}
			aria-label={m.blog_search_placeholder()}
		/>
		<button type="submit" aria-label={m.nav_search()}>↵</button>
		{#if filter.tag}<input type="hidden" name="tag" value={filter.tag} />{/if}
		{#if filter.year}<input type="hidden" name="year" value={String(filter.year)} />{/if}
		{#if filter.sort !== 'new'}
			<input type="hidden" name="sort" value={filter.sort} />
		{/if}
	</form>
	{#if query}
		<div class="t-filters">
			<span class="t-flabel">grep:</span>
			<a class="t-chip active" href={link({ q: null, page: 1 })}>“{query}” ✕</a>
		</div>
	{/if}

	<div class="t-filters">
		<span class="t-flabel">type:</span>
		<a class="t-chip" class:active={!filter.type} href={link({ type: null, page: 1 })}>*</a>
		{#each categories as c (c.slug)}
			<a
				class="t-chip"
				class:active={filter.type === c.slug}
				href={link({ type: filter.type === c.slug ? null : c.slug, page: 1 })}>{c.slug}</a
			>
		{/each}
	</div>
	{#if series.length > 0}
		<div class="t-filters">
			<span class="t-flabel">book:</span>
			<a
				class="t-chip"
				class:active={!filter.series && !filter.sonly}
				href={link({ series: null, sonly: false, page: 1 })}>*</a
			>
			{#each series as s (s.slug)}
				<a
					class="t-chip"
					class:active={filter.series === s.slug}
					href={link({ series: filter.series === s.slug ? null : s.slug, sonly: false, page: 1 })}
					>{s.slug}</a
				>
			{/each}
			<a
				class="t-chip"
				class:active={filter.sonly}
				href={link({ sonly: !filter.sonly, series: null, page: 1 })}>◈only</a
			>
		</div>
	{/if}

	<div class="t-filters">
		<span class="t-flabel">{m.blog_filter_all()}:</span>
		<a class="t-chip" class:active={!filter.tag} href={link({ tag: null, page: 1 })}>*</a>
		{#each tags as tag (tag.name)}
			<a
				class="t-chip"
				class:active={filter.tag === tag.name}
				href={link({ tag: filter.tag === tag.name ? null : tag.name, page: 1 })}>#{tag.display}</a
			>
		{/each}
	</div>
	{#if years.length > 1}
		<div class="t-filters">
			<span class="t-flabel">year:</span>
			<a class="t-chip" class:active={!filter.year} href={link({ year: null, page: 1 })}>*</a>
			{#each years as ys (ys.year)}
				<a
					class="t-chip"
					class:active={filter.year === ys.year}
					href={link({ year: filter.year === ys.year ? null : ys.year, page: 1 })}
					>{ys.year}({ys.count})</a
				>
			{/each}
		</div>
	{/if}
	<div class="t-filters">
		<span class="t-flabel">sort:</span>
		<a class="t-chip" class:active={filter.sort === 'new'} href={link({ sort: 'new', page: 1 })}
			>{m.blog_sort_new()}</a
		>
		<a class="t-chip" class:active={filter.sort === 'views'} href={link({ sort: 'views', page: 1 })}
			>{m.blog_sort_views()}</a
		>
	</div>

	<table class="t-ls">
		<tbody>
			{#each posts as p (p.slug)}
				<tr>
					<td class="t-date">{formatDate(p.date)}</td>
					<td class="t-name"><a href={href(`/blog/${p.slug}`)}>{p.title}</a></td>
					<td class="t-views">{p.views}</td>
					<td class="t-tags"
						>{#each p.tags as t (t.name)}<span>#{t.display}</span>{/each}</td
					>
				</tr>
			{:else}
				<tr>
					<td class="t-empty">（無輸出 — {m.blog_empty()}）</td>
				</tr>
			{/each}
			{#each extra as x (x.slug)}
				<tr>
					<td class="t-date">{formatDate(x.date)}</td>
					<td class="t-name"><a href={href(`/blog/${x.slug}`)}>{x.title}</a></td>
					<td class="t-views">{x.views}</td>
					<td class="t-tags"
						>{#each x.tags as t (t.name)}<span>#{t.display}</span>{/each}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if canMore || extra.length > 0}
		<p class="t-more" bind:this={sentinel}>
			{#if canMore}
				<button
					type="button"
					class="t-more-btn"
					disabled={loadingMore}
					onclick={() => void loadMore()}
				>
					{loadingMore ? '…' : `tail -f （${loadedCount}/${total}）`}
				</button>
			{:else}
				<span>— EOF —</span>
			{/if}
		</p>
	{/if}

	{#if totalPages > 1}
		<div class="t-pager">
			{#if page > 1}
				<a href={link({ page: page - 1 })}>← prev</a>
			{/if}
			<span class="t-pos">page {page}/{totalPages}</span>
			{#if page < totalPages}
				<a href={link({ page: page + 1 })}>next →</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.t-blog {
		position: relative;
	}

	.t-more {
		margin: 1rem 0 0;
	}

	.t-more-btn {
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-strong);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		padding: 0.35rem 0.9rem;
		cursor: pointer;
	}

	.t-more-btn:disabled {
		opacity: 0.55;
	}
	.t-blog {
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vh, 4rem) 1.25rem clamp(3rem, 8vh, 5rem);
		font-family: var(--font-mono);
	}

	.t-cmd-head {
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--color-ink);
		margin: 0;
	}

	.t-count {
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		margin: 0.5rem 0 1.25rem;
	}

	.t-grep {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.35rem;
		padding: 0.45rem 0.7rem;
		margin-bottom: 1rem;
	}

	.t-grep:focus-within {
		border-color: var(--color-strong);
	}

	.t-grep input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.t-grep input::placeholder {
		color: var(--color-ink-muted);
		opacity: 0.7;
	}

	.t-grep button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-strong);
		font-family: var(--font-mono);
		font-size: 0.9rem;
	}

	.t-prompt {
		color: var(--color-strong);
	}

	.t-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		align-items: baseline;
		margin-bottom: 0.6rem;
		font-size: 0.8rem;
	}

	.t-flabel {
		color: var(--color-ink-muted);
	}

	.t-chip {
		color: var(--color-ink);
		text-decoration: none;
		padding: 0.1rem 0.45rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.25rem;
	}

	.t-chip:hover {
		color: var(--color-strong);
		border-color: var(--color-strong);
	}

	.t-chip.active {
		color: var(--color-strong);
		border: 1px solid var(--color-strong);
	}

	.t-ls {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin-top: 1rem;
	}

	.t-ls td {
		padding: 0.5rem 0.75rem 0.5rem 0;
		border-bottom: 1px dashed var(--color-line);
		vertical-align: top;
	}

	.t-date {
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.t-name a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-name a:hover {
		color: var(--color-strong);
	}

	.t-views {
		color: var(--color-ink-muted);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.t-tags {
		color: var(--color-ink-muted);
	}

	.t-tags span {
		margin-right: 0.5rem;
	}

	.t-empty {
		color: var(--color-ink-muted);
	}

	.t-pager {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 1.25rem;
		font-size: 0.85rem;
	}

	.t-pager a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.t-pager a:hover {
		color: var(--color-strong);
	}

	.t-pos {
		color: var(--color-ink);
	}
</style>
