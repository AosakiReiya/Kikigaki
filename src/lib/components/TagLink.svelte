<script lang="ts">
	import { href } from '$lib/nav';
	import { blogQuery } from '$lib/blog-params';

	let { name, display, count }: { name: string; display?: string; count?: number } = $props();
	const shown = $derived(display ?? name);
</script>

<a class="tag-link" href={href('/blog' + blogQuery({ tag: name }))} data-animate="tag">
	#{shown}
	{#if count !== undefined}
		<span class="count">({count})</span>
	{/if}
</a>

<style>
	.tag-link {
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		color: var(--color-ink);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition:
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.tag-link:hover {
		border-color: var(--color-strong);
	}

	.count {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
	}
</style>
