<script lang="ts">
	import { formatDate } from '$lib/format';
	import { locales } from '$lib/paraglide/runtime';
	import { LOCALE_LABELS } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');
	let shown = $state(20);
	let statusFilter = $state<'all' | 'published' | 'draft'>('all');
	let tagFilter = $state('');
	let seriesFilter = $state('');
	let categoryFilter = $state('');
	let sonlyFilter = $state<'all' | 'only' | 'exclude'>('all');
	const catName = (t: string) => data.categories.find((c) => c.slug === t)?.name ?? t;

	const filtered = $derived(
		!data.dbReady
			? []
			: data.posts.filter((post) => {
					const q = query.trim().toLowerCase();
					if (q && !post.title.toLowerCase().includes(q) && !post.slug.toLowerCase().includes(q)) {
						return false;
					}
					if (statusFilter === 'published' && !post.published) return false;
					if (statusFilter === 'draft' && post.published) return false;
					if (tagFilter && !(data.postTagsBySlug[post.slug] ?? []).includes(tagFilter))
						return false;
					if (categoryFilter && post.type !== categoryFilter) return false;
					if (seriesFilter && !(data.postSeriesBySlug[post.slug] ?? []).includes(seriesFilter))
						return false;
					if (sonlyFilter === 'only' && !post.seriesOnly) return false;
					if (sonlyFilter === 'exclude' && post.seriesOnly) return false;
					return true;
				})
	);

	/* * Phase 58.6 load-more: filtered results presented in chunks */
	const visible = $derived(filtered.slice(0, shown));
	$effect(() => {
		void query;
		void statusFilter;
		void tagFilter;
		void seriesFilter;
		void categoryFilter;
		void sonlyFilter;
		shown = 20;
	});

	async function togglePin(e: SubmitEvent, slug: string) {
		e.preventDefault();
		const fd = new FormData();
		fd.set('id', `post:${slug}`);
		const res = await fetch('/admin/posts?/togglePin', { method: 'POST', body: fd });
		const j = (await res.json().catch(() => null)) as { type?: string } | null;
		if (j?.type === 'success' || res.ok) {
			window.location.reload();
		}
	}
</script>

<svelte:head>
	<title>文章 — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">文章</h1>
	<a class="new" href="/admin/posts/new">＋ 新建文章</a>
</div>
<p class="note">
	內容以 D1 為準（v1.5 CMS 化）；點擊標題進入編輯器（正文 Markdown
	所見即所得、封面、標籤、釘選）。原始備份仍同步於 <code>content/blog/*.md</code>（git）。
</p>

<div class="filters">
	<input
		class="search"
		type="search"
		placeholder="搜尋標題或 slug…"
		bind:value={query}
		autocomplete="off"
		aria-label="搜尋文章"
	/>
	<select class="select" bind:value={statusFilter} aria-label="依發布狀態篩選">
		<option value="all">全部狀態</option>
		<option value="published">已發布</option>
		<option value="draft">草稿</option>
	</select>
	{#if data.dbReady && data.allTags.length > 0}
		<select class="select" bind:value={tagFilter} aria-label="依標籤篩選">
			<option value="">全部標籤（{data.allTags.length}）</option>
			{#each data.allTags as tag (tag)}
				<option value={tag}>{tag}</option>
			{/each}
		</select>
	{/if}
	{#if data.dbReady && data.categories.length > 0}
		<select class="select" bind:value={categoryFilter} aria-label="依分類篩選">
			<option value="">全部分類</option>
			{#each data.categories as c (c.slug)}
				<option value={c.slug}>{c.name}</option>
			{/each}
		</select>
	{/if}
	{#if data.dbReady && data.allSeries.length > 0}
		<select class="select" bind:value={seriesFilter} aria-label="依系列篩選">
			<option value="">全部系列（{data.allSeries.length}）</option>
			{#each data.allSeries as s (s.slug)}
				<option value={s.slug}>{s.name}</option>
			{/each}
		</select>
	{/if}
	{#if data.dbReady}
		<select class="select" bind:value={sonlyFilter} aria-label="僅系列文章篩選">
			<option value="all">一般＋僅系列</option>
			<option value="exclude">僅看一般</option>
			<option value="only">僅看僅系列</option>
		</select>
	{/if}
	<span class="count">共 {filtered.length} 篇</span>
</div>

<table class="table">
	<thead>
		<tr>
			<th>標題</th>
			<th>翻譯</th>
			<th>標籤</th>
			<th>發布日期</th>
			<th>狀態</th>
			<th class="num-col">瀏覽數</th>
			<th>釘選</th>
		</tr>
	</thead>
	<tbody>
		{#each visible as post (post.id)}
			<tr>
				<td>
					<a href="/admin/posts/{post.slug}">{post.title}</a>
					{#if post.type !== 'article'}<span class="badge-cat">{catName(post.type)}</span>{/if}
					{#if post.seriesOnly}<span class="badge-only" title="僅在系列中顯示（列表與搜尋退場）"
							>僅系列</span
						>{/if}
				</td>
				<td
					class="tr-cell"
					title={locales
						.map(
							(l) =>
								`${LOCALE_LABELS[l]}：${post.translatedLocales.includes(l) ? '已翻譯' : '未翻譯'}`
						)
						.join('\n')}
				>
					{#each locales as loc (loc)}
						<span class="tr-dot" class:ok={post.translatedLocales.includes(loc)}
							>{post.translatedLocales.includes(loc) ? '●' : '○'}</span
						>
					{/each}
				</td>
				<td class="tags-cell"
					>{#each data.postTagsBySlug[post.slug] ?? [] as tag (tag)}<span class="tag">{tag}</span
						>{/each}</td
				>
				<td>
					{post.publishedAt ? formatDate(post.publishedAt.toISOString().slice(0, 10)) : '—'}
					{#if !post.published && post.publishedAt && post.publishedAt > new Date()}
						<span
							class="scheduled-badge"
							title="排程發文：{post.publishedAt
								.toISOString()
								.slice(0, 16)
								.replace('T', ' ')} UTC 到期自動發布"
							>🕒 {post.publishedAt.toISOString().slice(11, 16)}</span
						>
					{/if}
				</td>
				<td>{post.published ? '已發布' : '草稿'}</td>
				<td class="num-col">{post.views}</td>
				<td>
					<form
						method="POST"
						action="/admin/posts?/togglePin"
						onsubmit={(e) => togglePin(e, post.slug)}
						class="pin-form"
					>
						<button
							type="submit"
							class="pin-btn"
							class:active={!!post.pinned}
							title="切換釘選（主頁橫向卡片）"
						>
							{post.pinned ? '📌' : '○'}
						</button>
					</form>
				</td>
			</tr>
		{:else}
			<tr>
				<td colspan="7" class="empty-row">沒有符合的文章</td>
			</tr>
		{/each}
	</tbody>
</table>

{#if filtered.length > shown}
	<button type="button" class="more-btn" onclick={() => (shown += 20)}>
		載入更多（還有 {filtered.length - shown} 篇）
	</button>
{:else if filtered.length > 20}
	<p class="more-end">— 已顯示全部 {filtered.length} 篇 —</p>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.new {
		font-size: 0.875rem;
		color: var(--color-accent-ink);
		background: var(--color-accent);
		padding: 0.4375rem 0.875rem;
		border-radius: 0.5rem;
		text-decoration: none;
		font-weight: 600;
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 2rem;
	}

	.note code {
		font-family: var(--font-mono);
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
		margin-bottom: 1.25rem;
	}

	.search {
		flex: 1;
		min-width: 12rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
	}

	.search:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.select {
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
	}

	.select:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.tags-cell {
		max-width: 14rem;
	}

	.tr-cell {
		white-space: nowrap;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
	}

	.tr-dot {
		color: var(--color-ink-muted);
		opacity: 0.5;
	}

	.tr-dot.ok {
		color: var(--color-accent);
		opacity: 1;
	}

	.tag {
		display: inline-block;
		margin: 0.125rem 0.25rem 0.125rem 0;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		border: 1px solid var(--color-line);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.empty-row {
		text-align: center;
		color: var(--color-ink-muted);
		padding: 2.5rem 1rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}

	.table th,
	.table td {
		text-align: left;
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--color-line);
	}

	.table th {
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.8125rem;
	}

	.table a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.table a:hover {
		text-decoration: underline;
	}

	.num-col {
		width: 6rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.pin-form {
		margin: 0;
	}

	.pin-btn {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		border-radius: 0.375rem;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.pin-btn.active {
		border-color: var(--color-accent);
	}

	@media (max-width: 767px) {
		.table {
			display: block;
			overflow-x: auto;
		}
	}

	.scheduled-badge {
		margin-left: 0.375rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.0625rem 0.5rem;
		white-space: nowrap;
	}

	.badge-cat {
		margin-left: 0.4rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0 0.4rem;
		vertical-align: 0.0625rem;
	}

	.badge-only {
		margin-left: 0.4rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-strong);
		border: 1px solid color-mix(in oklab, var(--color-strong) 40%, transparent);
		border-radius: 999px;
		padding: 0 0.4rem;
		vertical-align: 0.0625rem;
	}

	.more-btn,
	.more-end {
		display: block;
		margin: 1.25rem auto 0;
		padding: 0.5rem 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-strong);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.more-end {
		border: none;
		background: none;
		color: var(--color-ink-muted);
	}
</style>
