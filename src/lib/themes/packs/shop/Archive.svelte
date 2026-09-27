<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { reveal } from '$lib/animation/reveal';
	import { stagger } from '$lib/animation/stagger';
	import { maskReveal } from '$lib/animation/text';
	import { hoverPreview } from '$lib/animation/hover-preview';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import PostRow from '$lib/components/PostRow.svelte';
	import type { ArchiveProps } from '../../contracts';

	let { tag, display, posts, total, page: pageNum, totalPages }: ArchiveProps = $props();
</script>

<section class="tag-head" data-animate="tag-head">
	<p class="kicker" use:reveal={{ y: 12 }}>{m.nav_tags()}</p>
	<div class="mask-reveal">
		<h1 use:maskReveal data-animate="tag-title">#{display}</h1>
	</div>
	<p class="count" use:reveal={{ delay: 0.15, y: 12 }}>{m.tag_count({ count: total })}</p>
</section>

<section class="posts" aria-label={display}>
	<SectionHeading index="01">
		<span>{m.home_posts()}</span>
	</SectionHeading>
	<ul class="post-list" use:stagger={{ target: 'li' }} use:hoverPreview>
		{#each posts as post, i (post.slug)}
			<PostRow {post} index={i} />
		{/each}
	</ul>

	{#if totalPages > 1}
		<nav class="pagination" aria-label={m.pagination_nav()}>
			{#if pageNum > 1}
				<a
					class="page-btn"
					href={href(
						pageNum === 2
							? `/tags/${encodeURIComponent(tag)}`
							: `/tags/${encodeURIComponent(tag)}?page=${pageNum - 1}`
					)}>← {m.pagination_prev()}</a
				>
			{:else}
				<span class="page-btn disabled" aria-disabled="true">← {m.pagination_prev()}</span>
			{/if}
			<span class="page-info">{m.pagination_page({ current: pageNum, total: totalPages })}</span>
			{#if pageNum < totalPages}
				<a class="page-btn" href={href(`/tags/${encodeURIComponent(tag)}?page=${pageNum + 1}`)}
					>{m.pagination_next()} →</a
				>
			{:else}
				<span class="page-btn disabled" aria-disabled="true">{m.pagination_next()} →</span>
			{/if}
		</nav>
	{/if}
</section>

<style>
	.tag-head {
		max-width: 80rem;
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

	.tag-head h1 {
		font-size: var(--text-h1);
		font-weight: 700;
		color: var(--color-ink);
	}

	.count {
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}

	section.posts {
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	section.posts :global(.section-heading) {
		margin-bottom: 2rem;
	}

	.post-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	@container not style(--card-layout: 1) {
		.post-list :global(li:last-child) {
			border-bottom: 1px solid var(--color-line);
		}
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-top: 2.5rem;
		padding-bottom: clamp(3rem, 8vh, 5rem);
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
