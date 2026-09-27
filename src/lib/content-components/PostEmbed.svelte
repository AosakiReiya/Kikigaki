<script lang="ts">
	/* * :::post — on-site post embed card; data pre-injected by the post route (embeds: only the few referenced on this page) */
	import { page } from '$app/state';
	import { href } from '$lib/nav';
	import type { SearchIndexEntry } from '$lib/plugins/types';

	let { slug = '' }: { slug?: string } = $props();

	const target = $derived(
		(page.data.embeds as SearchIndexEntry[] | undefined)?.find((p) => p.slug === String(slug))
	);
</script>

{#if target}
	<a class="embed" href={href(`/blog/${target.slug}`)}>
		<span class="embed-kicker">站內文章</span>
		<span class="embed-title">{target.title}</span>
		{#if target.summary}
			<span class="embed-summary">{target.summary}</span>
		{/if}
		{#if target.tags.length > 0}
			<span class="embed-tags">
				{#each target.tags as tag (tag.name)}#{tag.display}{/each}
			</span>
		{/if}
		<span class="embed-arrow" aria-hidden="true">→</span>
	</a>
{:else}
	<p class="embed-missing">文章嵌入：找不到「{String(slug)}」{slug ? '' : '（缺少 slug=）'}</p>
{/if}

<style>
	.embed {
		position: relative;
		display: grid;
		gap: 0.375rem;
		margin: 2rem 0;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		text-decoration: none;
		background: color-mix(in srgb, var(--color-ink) 3%, transparent);
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}

	.embed:hover {
		border-color: var(--color-strong);
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
	}

	.embed-kicker {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}

	.embed-title {
		font-size: 1.0625rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.embed-summary {
		font-size: 0.875rem;
		line-height: 1.7;
		color: var(--color-ink-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.embed-tags {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.embed-arrow {
		position: absolute;
		top: 1.25rem;
		right: 1.375rem;
		color: var(--color-ink-muted);
		transition:
			transform 0.2s ease,
			color 0.2s ease;
	}

	.embed:hover .embed-arrow {
		color: var(--color-strong);
		transform: translateX(4px);
	}

	.embed-missing {
		margin: 1.5rem 0;
		padding: 0.625rem 0.875rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
