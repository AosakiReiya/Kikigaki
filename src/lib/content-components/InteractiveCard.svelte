<script lang="ts">
	/* * :::card — interactive link card (since Phase 54 a flush+lift combination of the Card primitive) */
	import Card from '$lib/components/Card.svelte';

	let {
		title = '',
		desc = '',
		image = '',
		url = '',
		kicker = '',
		cta = '前往 →'
	}: {
		title?: string;
		desc?: string;
		image?: string;
		url?: string;
		kicker?: string;
		cta?: string;
	} = $props();

	const hrefValue = $derived(String(url || ''));
</script>

{#if hrefValue}
	<Card
		class="icard"
		href={hrefValue}
		external
		variant="flush"
		effect="lift"
		media={String(image)}
		mediaAspect="21 / 9"
		mediaZoom={false}
	>
		{#if kicker}
			<span class="icard-kicker">{String(kicker)}</span>
		{/if}
		<span class="icard-title">{String(title)}</span>
		{#if desc}
			<span class="icard-desc">{String(desc)}</span>
		{/if}
		<span class="icard-cta">{String(cta)}</span>
	</Card>
{:else}
	<div class="icard-fallback">
		<span class="icard-title">{String(title) || 'card：缺少 url='}</span>
	</div>
{/if}

<style>
	.icard-kicker {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-strong);
	}

	.icard-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.icard-desc {
		font-size: 0.9375rem;
		line-height: 1.75;
		color: var(--color-ink-muted);
	}

	.icard-cta {
		margin-top: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		transition:
			color 0.2s ease,
			transform 0.2s ease;
	}

	/* lift hover displacement belongs to the Card skin; cta sliding + tinting is content-layer interaction */
	:global(.icard:hover) .icard-cta {
		color: var(--color-strong);
		transform: translateX(3px);
	}

	.icard-fallback {
		margin: 2rem 0;
		padding: 1.375rem 1.5rem;
		border: 1px dashed var(--color-line);
		border-radius: 1rem;
	}
</style>
