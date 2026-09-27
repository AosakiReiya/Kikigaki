<script lang="ts">
	/**
	 * Card (Phase 54) — the unified site-wide card skeleton.
	 *
	 * Three orthogonal layers (differences never stuffed into a boolean sea):
	 * - variant: layout (padding/media frame)    default | flush | rail
	 * - effect : interaction (hover skin/displacement/3D) none | text | border | lift | glow | glow-tilt
	 * - media  : renders the image only when present; decoration is an explicit choice (off by default) —
	 *   "no image ≠ enter empty-image mode": coverless means a pure content card, no zombie decoration.
	 *
	 * Content structure (title/meta/badge…) is entirely the children slot's call — order is free;
	 * type-specific styling stays in consumer components (card-frame tokens change site-wide in one place).
	 */
	import { cardFx, type CardEffect } from '$lib/animation/card-fx';
	import './card.css';
	import type { Snippet } from 'svelte';

	let {
		href = '',
		external = false,
		variant = 'default',
		effect = 'none',
		media = '',
		mediaAlt = '',
		mediaAspect = '16 / 9',
		mediaZoom = true,
		mediaClip = true,
		decoration = false,
		overlay,
		class: klass = '',
		children,
		...rest
	}: {
		/* * with a value render <a>, without render <div> (pure display card) */
		href?: string;
		external?: boolean;
		variant?: 'default' | 'flush' | 'rail';
		effect?: CardEffect;
		/* * cover URL; empty string = render no media (unless decoration) */
		media?: string;
		mediaAlt?: string;
		/** CSS aspect-ratio */
		mediaAspect?: string;
		/* * hover image micro-push (text cards like icard can disable it) */
		mediaZoom?: boolean;
		/* * whether the media frame clips overflow (false = lets watermark numbers hang past the bottom edge — About watermark vocabulary) */
		mediaClip?: boolean;
		/* * whether to explicitly render the gradient + ⌁ decoration without media (off by default) */
		decoration?: boolean;
		/* * floating layer over the media frame (big ordinal / badge; consumers inject it absolutely positioned) */
		overlay?: Snippet;
		/* * remaining attributes pass through to the root (data-* hooks: Flip/hScroll data-tilt etc.) */
		[key: string]: unknown;
		class?: string;
		children?: Snippet;
	} = $props();

	const isLink = $derived(Boolean(href));
	const showMedia = $derived(Boolean(media));
	/* * decoration and media are mutually exclusive: appears only when explicitly enabled and media-less */
	const showDeco = $derived(!media && decoration);
</script>

{#if isLink}
	<a
		class="card card--{variant} {klass}"
		data-effect={effect}
		data-media-zoom={mediaZoom ? '' : undefined}
		data-media-clip={mediaClip ? undefined : 'false'}
		{href}
		target={external ? '_blank' : undefined}
		rel={external ? 'noopener noreferrer' : undefined}
		use:cardFx={effect}
		{...rest}
	>
		{#if showMedia}
			<span class="card-media" style:aspect-ratio={mediaAspect}>
				<img
					class="card-img"
					src={media}
					alt={mediaAlt}
					width="1200"
					height="630"
					loading="lazy"
					decoding="async"
				/>
				{@render overlay?.()}
			</span>
		{:else if showDeco}
			<span class="card-media card-media--deco" aria-hidden="true">
				<span class="card-glyph">⌁</span>
				{@render overlay?.()}
			</span>
		{/if}
		<span class="card-body">
			{@render children?.()}
		</span>
	</a>
{:else}
	<div
		class="card card--{variant} {klass}"
		data-effect={effect}
		data-media-zoom={mediaZoom ? '' : undefined}
		data-media-clip={mediaClip ? undefined : 'false'}
		use:cardFx={effect}
		{...rest}
	>
		{#if showMedia}
			<span class="card-media" style:aspect-ratio={mediaAspect}>
				<img class="card-img" src={media} alt={mediaAlt} loading="lazy" decoding="async" />
				{@render overlay?.()}
			</span>
		{:else if showDeco}
			<span class="card-media card-media--deco" aria-hidden="true">
				<span class="card-glyph">⌁</span>
				{@render overlay?.()}
			</span>
		{/if}
		<span class="card-body">
			{@render children?.()}
		</span>
	</div>
{/if}

<style>
	/* ---- skeleton (border/radius/background/transitions = single site-wide source) ---- */
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1.4rem 1.5rem 1.5rem;
		border: 1px solid var(--color-line);
		border-radius: 1rem;
		background: var(--color-bg-elevated);
		color: inherit;
		text-decoration: none;
		overflow: hidden;
		will-change: transform;
		transition:
			border-color 0.22s ease,
			box-shadow 0.22s ease,
			transform 0.25s ease;
	}

	/* flush: media bleeds, body brings its own padding (:::card style) */
	.card--flush {
		gap: 0;
		padding: 0;
	}
	.card--flush .card-media {
		border-radius: 0;
	}
	.card--flush .card-body {
		padding: 1.375rem 1.5rem 1.5rem;
	}

	/* rail: image frame inset (featured-track / blog-grid style) */
	.card--rail {
		gap: 0.25rem;
		padding: 0;
	}
	.card--rail .card-media {
		margin: 0.85rem 0.85rem 0;
	}
	.card--rail .card-body {
		padding: 0.9rem 1.25rem 0;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
	}

	/* ---- media ---- */
	.card-media {
		position: relative;
		display: block;
		overflow: hidden;
		border-radius: 0.7rem;
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}
	/* watermark-prominent vocabulary (About): the media frame doesn't clip; overflowing numbers are contained by the card root's overflow */
	.card[data-media-clip='false'] .card-media {
		overflow: visible;
	}
	.card-media :global(.card-media--bleed) {
		position: absolute;
		inset: 0;
	}

	.card-img {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}

	.card[data-media-zoom]:hover .card-img {
		scale: 1.06;
		transition: scale 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.card-img {
		transition: scale 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* decoration/glyph styles live in card.css (the single site-wide source) */

	/* ---- hover skin (text = plain markup; type colors/highlight customizable via user CSS) ---- */
	.card[data-effect='border']:hover {
		border-color: var(--color-strong);
	}

	.card[data-effect='lift']:hover {
		border-color: color-mix(in srgb, var(--color-strong) 50%, var(--color-line));
		box-shadow: var(--shadow-card-hover);
		transform: translateY(-3px);
	}

	.card[data-effect='glow']:hover,
	.card[data-effect='glow-tilt']:hover {
		border-color: color-mix(in srgb, var(--color-strong) 50%, var(--color-line));
		box-shadow: var(--shadow-card-hover);
	}

	/* glow ::after lives in card.css (shared as one copy with PostRow[data-glow]) */
</style>
