<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { formatDate } from '$lib/format';
	import type { ArchiveProps } from '../../contracts';

	let { tag, display, posts, total, page, totalPages }: ArchiveProps = $props();
</script>

<section class="t-arch">
	<h1 class="t-cmd-head">$ grep --tag '#{display}' ~/posts</h1>
	<p class="t-count"># {m.tag_count({ count: total })}</p>

	<table class="t-ls">
		<tbody>
			{#each posts as p (p.slug)}
				<tr>
					<td class="t-date">{formatDate(p.date)}</td>
					<td class="t-name"><a href={href(`/blog/${p.slug}`)}>{p.title}</a></td>
					<td class="t-tags"
						>{#each p.tags as t (t.name)}<span>#{t.display}</span>{/each}</td
					>
				</tr>
			{:else}
				<tr>
					<td class="t-empty">（無輸出）</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if totalPages > 1}
		<div class="t-pager">
			{#if page > 1}
				<a
					href={href(
						page === 2
							? `/tags/${encodeURIComponent(tag)}`
							: `/tags/${encodeURIComponent(tag)}?page=${page - 1}`
					)}>← prev</a
				>
			{/if}
			<span class="t-pos">page {page}/{totalPages}</span>
			{#if page < totalPages}
				<a href={href(`/tags/${encodeURIComponent(tag)}?page=${page + 1}`)}>next →</a>
			{/if}
		</div>
	{/if}
</section>

<style>
	.t-arch {
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vh, 4rem) 1.25rem;
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
