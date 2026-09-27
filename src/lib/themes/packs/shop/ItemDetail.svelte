<script lang="ts">
	/** shop pack detail surface: product-page language (large image, prominent buy row, description after). */
	import { href } from '$lib/nav';
	import BuyBar from '$lib/components/BuyBar.svelte';
	import type { GenericItemProps } from '../../contracts';

	let {
		typeKey,
		typeLabel,
		titleField,
		fields,
		item,
		html,
		buy = null
	}: GenericItemProps = $props();

	const title = String(item.data[titleField] ?? item.slug);
	const cover = fields.find((f) => f.kind === 'media')
		? String(item.data[fields.find((f) => f.kind === 'media')!.key] ?? '')
		: '';
	const dateKey = fields.find((f) => f.kind === 'date')?.key;
	const dateVal = dateKey ? String(item.data[dateKey] ?? '').slice(0, 10) : '';
	const bodyKeys = fields.filter((f) => html[f.key]).map((f) => f.key);
	const facts = fields.filter(
		(f) =>
			!html[f.key] &&
			f.kind !== 'media' &&
			f.kind !== 'date' &&
			f.key !== titleField &&
			f.key !== 'price' &&
			f.key !== 'file' &&
			String(item.data[f.key] ?? '') !== ''
	);
</script>

<article class="pd">
	<a class="back" href={href(`/${typeKey}`)}>← {typeLabel}</a>
	<div class="gallery">
		{#if cover}
			<img src={cover} alt="" />
		{:else}
			<span class="ph" aria-hidden="true">{title.slice(0, 1)}</span>
		{/if}
		<div class="order">
			<h1>{title}</h1>
			{#if dateVal}<p class="date">{dateVal}</p>{/if}
			{#if buy}
				<BuyBar {typeKey} slug={item.slug} {title} price={buy.price} />
			{/if}
			{#if facts.length}
				<dl>
					{#each facts as f (f.key)}
						{#if f.kind === 'repeater' && Array.isArray(item.data[f.key])}
							<dt>{f.key}</dt>
							<dd>
								{(item.data[f.key] as string[]).join(' · ')}
							</dd>
						{:else}
							<dt>{f.key}</dt>
							<dd>{String(item.data[f.key])}</dd>
						{/if}
					{/each}
				</dl>
			{/if}
		</div>
	</div>
	{#each bodyKeys as k (k)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags — server-side renderMarkdown output -->
		<div class="desc prose">{@html html[k]}</div>
	{/each}
</article>

<style>
	.pd {
		max-width: 68rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vh, 4.5rem) 1.5rem 4rem;
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
	.gallery {
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		gap: 2.25rem;
		margin-top: 1.5rem;
		align-items: start;
	}
	@media (max-width: 719px) {
		.gallery {
			grid-template-columns: 1fr;
		}
	}
	.gallery img {
		width: 100%;
		border: 1px solid var(--color-line);
	}
	.ph {
		display: grid;
		place-items: center;
		aspect-ratio: 4 / 3;
		font-family: var(--font-display);
		font-size: 6rem;
		background: linear-gradient(135deg, var(--color-accent), var(--color-bg-elevated));
		color: var(--color-accent-ink);
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	.date {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-top: 0.4rem;
	}
	dl {
		margin: 1.25rem 0 0;
		font-size: 0.8125rem;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 1rem;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	dd {
		margin: 0;
	}
	.desc {
		margin-top: 2.75rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--color-line);
	}
</style>
