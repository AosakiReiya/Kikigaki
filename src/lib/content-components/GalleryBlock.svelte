<script lang="ts">
	/* * :::gallery — image grid; data is a JSON array (string URLs or {src,alt}) or the data= param */
	let {
		data,
		cols = 3,
		title = ''
	}: {
		data?: unknown;
		cols?: number;
		title?: string;
	} = $props();

	interface Shot {
		src: string;
		alt: string;
	}

	const shots = $derived.by((): Shot[] => {
		if (!Array.isArray(data)) return [];
		return data
			.map((item): Shot | null => {
				if (typeof item === 'string') return { src: item, alt: '' };
				if (item && typeof item === 'object') {
					const o = item as Record<string, unknown>;
					if (typeof o.src === 'string') return { src: o.src, alt: String(o.alt ?? '') };
				}
				return null;
			})
			.filter((s): s is Shot => s !== null);
	});

	const n = $derived(Math.min(Math.max(Number(cols) || 3, 1), 6));
</script>

{#if shots.length > 0}
	<figure class="gallery">
		{#if title}
			<figcaption class="g-title">{String(title)}</figcaption>
		{/if}
		<div class="g-grid" style:--g-cols={n}>
			{#each shots as shot, i (i)}
				<a class="g-cell" href={shot.src} target="_blank" rel="noopener">
					<img src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
				</a>
			{/each}
		</div>
	</figure>
{:else}
	<p class="g-error">gallery：缺少 data（JSON 圖片陣列）</p>
{/if}

<style>
	.gallery {
		margin: 2.5rem 0;
	}

	.g-title {
		font-weight: 700;
		color: var(--color-ink);
		margin-bottom: 1rem;
	}

	.g-grid {
		display: grid;
		grid-template-columns: repeat(var(--g-cols), minmax(0, 1fr));
		gap: 0.625rem;
	}

	.g-cell {
		display: block;
		border-radius: 0.75rem;
		overflow: hidden;
		border: 1px solid var(--color-line);
		aspect-ratio: 4 / 3;
	}

	.g-cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.35s ease;
	}

	.g-cell:hover img {
		transform: scale(1.045);
	}

	@media (max-width: 767px) {
		.g-grid {
			grid-template-columns: repeat(min(var(--g-cols), 2), minmax(0, 1fr));
		}
	}

	.g-error {
		margin: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
