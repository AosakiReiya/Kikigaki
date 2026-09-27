<script lang="ts">
	/* * :::callout — hint box; body is Markdown (passed via data-cc-children) */
	let {
		type = 'info',
		title = '',
		childrenHtml = ''
	}: {
		type?: string;
		title?: string;
		childrenHtml?: string;
	} = $props();

	const known = ['info', 'tip', 'warning', 'danger'];
	const resolved = $derived(known.includes(String(type)) ? String(type) : 'info');
</script>

<aside class="callout" data-type={resolved}>
	{#if title}
		<p class="callout-title">{String(title)}</p>
	{/if}
	<div class="callout-body prose-frag">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- body rendered by controlled markdown-it -->
		{@html String(childrenHtml ?? '')}
	</div>
</aside>

<style>
	.callout {
		margin: 2rem 0;
		padding: 1.125rem 1.375rem;
		border: 1px solid var(--color-line);
		border-left: 3px solid var(--tone);
		border-radius: 0.75rem;
		background: color-mix(in srgb, var(--tone) 6%, transparent);
	}

	.callout[data-type='info'] {
		--tone: var(--color-accent);
	}
	.callout[data-type='tip'] {
		--tone: #34d399;
	}
	.callout[data-type='warning'] {
		--tone: #fbbf24;
	}
	.callout[data-type='danger'] {
		--tone: #f87171;
	}

	.callout-title {
		margin: 0 0 0.375rem;
		font-weight: 700;
		color: var(--color-ink);
	}

	.callout-body {
		color: color-mix(in srgb, var(--color-ink) 85%, var(--color-bg));
		line-height: 1.85;
	}

	.callout-body :global(p) {
		margin: 0.5rem 0;
	}

	.callout-body :global(p:first-child) {
		margin-top: 0;
	}

	.callout-body :global(p:last-child) {
		margin-bottom: 0;
	}
</style>
