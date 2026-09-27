<script lang="ts">
	import ExtensionSlot from './ExtensionSlot.svelte';
	/**
	 * 79d default detail component for dynamic types (theme packs may override via extra.item).
	 * Neutral typographic language: serif title + rule lines + prose body — at home under all five themes.
	 */
	import { href } from '$lib/nav';
	import BuyBar from '$lib/components/BuyBar.svelte';
	import type { ContentItemRow } from '$lib/server/content-items';
	import type { ContentTypeField } from '$lib/server/content-types/types';

	let {
		typeKey,
		typeLabel,
		titleField,
		fields,
		item,
		html,
		buy = null
	}: {
		typeKey: string;
		typeLabel: string;
		titleField: string;
		fields: ContentTypeField[];
		item: ContentItemRow;
		html: Record<string, string>;
		buy?: { price: string } | null;
	} = $props();

	const str = (f: ContentTypeField) => {
		const hit = fields.find((x) => x.key === f.key);
		return hit ? String(item.data[hit.key] ?? '') : '';
	};
	const mainTitle = $derived(() => {
		const t = item.data[titleField];
		return typeof t === 'string' && t ? t : item.slug;
	});
	const dateKey = $derived(fields.find((f) => f.kind === 'date')?.key);
	const dateVal = $derived(dateKey ? str({ key: dateKey, kind: 'date' }).slice(0, 10) : '');
	const mediaKey = $derived(fields.find((f) => f.kind === 'media')?.key);
	const cover = $derived(mediaKey ? str({ key: mediaKey, kind: 'media' }) : '');
	const rest = $derived(
		fields.filter(
			(f) =>
				f.kind !== 'date' &&
				f.kind !== 'media' &&
				!html[f.key] &&
				f.key !== titleField &&
				String(item.data[f.key] ?? '') !== ''
		)
	);
</script>

<ExtensionSlot name="item.detail.before" />
<article class="gi" data-animate="generic-item">
	<a class="back" href={href(`/${typeKey}`)}>← {typeLabel}</a>
	{#if cover}
		<img class="cover" src={cover} alt="" loading="lazy" />
	{/if}
	<header class="head">
		{#if dateVal}<p class="dateline">{dateVal}</p>{/if}
		<h1>{mainTitle()}</h1>
	</header>
	{#if buy}
		<BuyBar {typeKey} slug={item.slug} title={mainTitle()} price={buy.price} />
	{/if}

	{#each fields.filter((f) => html[f.key]) as f (f.key)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags — server-side renderMarkdown output -->
		<div class="md prose">{@html html[f.key]}</div>
	{/each}

	{#if rest.length}
		<dl class="facts">
			{#each rest as f (f.key)}
				{#if f.kind === 'repeater' && Array.isArray(item.data[f.key])}
					<dd class="chips" style="grid-column:1/-1">
						{#each (item.data[f.key] as string[]) ?? [] as chip (chip)}
							<span>{chip}</span>
						{/each}
					</dd>
				{:else}
					<dt>{f.key}</dt>
					<dd>{String(item.data[f.key])}</dd>
				{/if}
			{/each}
		</dl>
	{/if}
</article>
<ExtensionSlot name="item.detail.after" />

<style>
	.gi {
		max-width: 46rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vh, 5rem) 1.5rem 0;
	}
	.back {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.back:hover {
		color: var(--color-ink);
	}
	.head {
		padding: 1rem 0 1.25rem;
		border-bottom: 3px solid var(--color-ink);
		margin-bottom: 1.75rem;
	}
	.dateline {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-bottom: 0.5rem;
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: var(--text-h1);
		font-weight: 700;
		line-height: 1.15;
	}
	.cover {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border: 1px solid var(--color-line);
		margin-bottom: 1.25rem;
	}
	.md:first-of-type {
		margin-top: 0;
	}
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.4rem 1.25rem;
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-line);
		font-size: 0.875rem;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-ink-muted);
	}
	dd {
		margin: 0;
		color: var(--color-ink);
	}
	.chips {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.chips span {
		border: 1px solid var(--color-line);
		padding: 0.1rem 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
</style>
