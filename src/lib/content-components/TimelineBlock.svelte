<script lang="ts">
	/* * :::timeline — timeline; data is a JSON array [{date,title,body?}] or the data= param */
	let {
		data,
		title = ''
	}: {
		data?: unknown;
		title?: string;
	} = $props();

	interface Entry {
		date?: string;
		title?: string;
		body?: string;
	}

	const entries = $derived(
		Array.isArray(data) ? (data as Entry[]).filter((e) => e && typeof e === 'object') : []
	);
</script>

{#if entries.length > 0}
	<section class="timeline">
		{#if title}
			<h3 class="tl-title">{String(title)}</h3>
		{/if}
		<ol>
			{#each entries as entry, i (i)}
				<li>
					<span class="tl-dot" aria-hidden="true"></span>
					{#if entry.date}
						<span class="tl-date">{String(entry.date)}</span>
					{/if}
					{#if entry.title}
						<span class="tl-entry-title">{String(entry.title)}</span>
					{/if}
					{#if entry.body}
						<span class="tl-body">{String(entry.body)}</span>
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{:else}
	<p class="tl-error">timeline：缺少 data（JSON 陣列）</p>
{/if}

<style>
	.timeline {
		margin: 2.5rem 0;
	}

	.tl-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0 0 1.5rem;
		color: var(--color-ink);
	}

	ol {
		list-style: none;
		margin: 0;
		padding: 0 0 0 1.5rem;
		border-left: 1px solid var(--color-line);
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	li {
		position: relative;
		display: grid;
		gap: 0.25rem;
	}

	.tl-dot {
		position: absolute;
		left: calc(-1.5rem - 4px);
		top: 0.45em;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--color-accent);
	}

	.tl-date {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		letter-spacing: 0.04em;
	}

	.tl-entry-title {
		font-weight: 700;
		color: var(--color-ink);
	}

	.tl-body {
		font-size: 0.9375rem;
		line-height: 1.8;
		color: color-mix(in srgb, var(--color-ink) 85%, var(--color-bg));
	}

	.tl-error {
		margin: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
