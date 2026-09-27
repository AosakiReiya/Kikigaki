<script lang="ts">
	/* * 79d default list component for dynamic types (theme packs may override via extra.itemList with gallery layouts etc.). */
	import { href } from '$lib/nav';
	import type { ContentItemRow } from '$lib/server/content-items';

	let {
		typeKey,
		label,
		titleField,
		items
	}: {
		typeKey: string;
		label: string;
		titleField: string;
		items: ContentItemRow[];
	} = $props();

	function titleOf(i: ContentItemRow): string {
		const t = i.data[titleField];
		return typeof t === 'string' && t ? t : i.slug;
	}
	function dateOf(i: ContentItemRow): string {
		const d = i.data['date'] ?? i.data['publishedAt'] ?? i.data['year'] ?? i.data['day'];
		if (typeof d === 'string') return d.slice(0, 10);
		return '';
	}
	function snippetOf(i: ContentItemRow): string {
		for (const v of Object.values(i.data)) {
			if (typeof v === 'string' && v.length > 8 && v !== titleOf(i))
				return v
					.replace(/[#*_>`\n]/g, ' ')
					.trim()
					.slice(0, 110);
		}
		return '';
	}
</script>

<section class="gl" data-animate="generic-list">
	<header class="head">
		<h1>{label}</h1>
	</header>
	{#if items.length === 0}
		<p class="muted">尚無公開條目。</p>
	{:else}
		<ul class="rows">
			{#each items as i (i.id)}
				<li>
					<a class="row" href={href(`/${typeKey}/${i.slug}`)}>
						<span class="t">{titleOf(i)}</span>
						{#if dateOf(i)}<time class="d" datetime={dateOf(i)}>{dateOf(i)}</time>{/if}
					</a>
					{#if snippetOf(i)}<p class="s">{snippetOf(i)}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.gl {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(3.5rem, 9vh, 6rem) 1.5rem 4rem;
	}
	.head {
		padding-bottom: 0.9rem;
		border-bottom: 3px solid var(--color-ink);
		margin-bottom: 0.5rem;
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(1.875rem, 4.5vw, 2.75rem);
		font-weight: 700;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		padding: 0.9rem 0;
		border-bottom: 1px solid var(--color-line);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		text-decoration: none;
		color: var(--color-ink);
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.125rem;
		font-weight: 700;
	}
	.row:hover .t {
		color: var(--color-accent);
	}
	.d {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		flex: none;
		padding-top: 0.25rem;
	}
	.s {
		margin: 0.35rem 0 0;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
	}
	.muted {
		color: var(--color-ink-muted);
	}
</style>
