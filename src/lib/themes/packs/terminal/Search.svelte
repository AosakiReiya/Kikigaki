<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { formatDate } from '$lib/format';
	import type { SearchProps } from '../../contracts';

	let { query, results, total, page, totalPages }: SearchProps = $props();

	const link = (p: number) =>
		href(`/search?q=${encodeURIComponent(query)}${p > 1 ? `&page=${p}` : ''}`);
</script>

<section class="t-search">
	<h1 class="t-cmd-head">$ grep -r {query ? `"${query}"` : ''} ~/posts</h1>
	{#if query}
		<p class="t-count"># {m.tag_count({ count: total })}</p>
	{:else}
		<p class="t-count"># {m.search_prompt()}</p>
	{/if}

	{#if query}
		<table class="t-ls">
			<tbody>
				{#each results as r (r.post.slug)}
					<tr>
						<td class="t-date">{formatDate(r.post.date)}</td>
						<td class="t-name">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- highlightHtml escapes everything first; only <mark> is injected -->
							<a href={href(`/blog/${r.post.slug}`)}>{@html r.titleHtml}</a>
						</td>
						<td class="t-tags"
							>{#each r.post.tags as t (t.name)}<span>#{t.display}</span>{/each}</td
						>
					</tr>
				{:else}
					<tr>
						<td class="t-empty">（無輸出 — {m.search_empty({ query })}）</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if totalPages > 1}
		<div class="t-pager">
			{#if page > 1}
				<a href={link(page - 1)}>← prev</a>
			{/if}
			<span class="t-pos">page {page}/{totalPages}</span>
			{#if page < totalPages}
				<a href={link(page + 1)}>next →</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.t-search {
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
		overflow-wrap: anywhere;
	}

	.t-count {
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		margin: 0.5rem 0 1.5rem;
	}

	.t-ls {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
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

	.t-name :global(mark) {
		background: transparent;
		color: var(--color-strong);
		font-weight: 700;
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
</style>
