<script lang="ts">
	/**
	 * BookCard (Phase 59A): a series card that looks like a book — unlike posts' "image above text below" Card,
	 * the cover bleeds to the frame edges, the title is printed on a translucent belt at the cover's bottom (rarely blocking art),
	 * left spine + right paper slices build the physical-book feel. Coverless = designed-color book face (site gradient ⌁ vocabulary),
	 * and the fixed-ratio frame fully cures "coverless cards collapsing short".
	 *
	 * Always a 3:4 portrait frame (59G: orientation removed, archived in the archive/series-orientation branch).
	 * GSAP: entrances delegated to the parent's use:stagger; hover via cardFx (3D tilt) + slight paper fan.
	 */
	import { cardFx } from '$lib/animation/card-fx';
	import './card.css';

	let {
		href = '',
		title,
		summary = '',
		cover = '',
		count = 0,
		mediaAlt = ''
	}: {
		href?: string;
		title: string;
		summary?: string;
		cover?: string;
		count?: number;
		mediaAlt?: string;
	} = $props();
</script>

<a class="bookcard" {href} use:cardFx>
	<span class="bc-face">
		{#if cover}
			<img
				class="bc-img"
				src={cover}
				alt={mediaAlt || title}
				loading="lazy"
				width="900"
				height="1200"
			/>
		{:else}
			<span class="bc-surface" aria-hidden="true"></span>
			<span class="bc-glyph" aria-hidden="true">⌁</span>
		{/if}
		<span class="bc-spine" aria-hidden="true"></span>
		<span class="bc-pages" aria-hidden="true"></span>
		<span class="bc-band">
			<span class="bc-title">{title}</span>
			{#if count > 0}<span class="bc-meta">{count} 章</span>{/if}
		</span>
	</span>
	{#if summary}<span class="bc-sum">{summary}</span>{/if}
</a>

<style>
	.bookcard {
		display: block;
		perspective: 1100px;
		text-decoration: none;
		color: inherit;
	}

	.bc-face {
		position: relative;
		display: block;
		aspect-ratio: 3 / 4;
		border-radius: 0.25rem 0.55rem 0.55rem 0.25rem;
		border: 1px solid color-mix(in oklab, var(--color-strong) 22%, var(--color-line));
		overflow: hidden;
		background: var(--color-bg-elevated);
		box-shadow:
			0 1px 2px rgb(0 0 0 / 18%),
			0 10px 26px -12px rgb(0 0 0 / 35%);
		transition: box-shadow 0.25s ease;
	}

	.bookcard:hover .bc-face {
		box-shadow:
			0 2px 4px rgb(0 0 0 / 20%),
			0 22px 44px -14px rgb(0 0 0 / 45%);
	}

	.bc-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* coverless: designed-color book face (site gradient vocabulary) + ⌁ — inside a fixed-ratio frame, never collapsing */
	.bc-surface {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(
				120% 90% at 85% -10%,
				color-mix(in srgb, var(--color-strong) 30%, transparent),
				transparent 60%
			),
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--color-accent) 22%, var(--color-bg-elevated)),
				var(--color-bg-elevated) 62%
			);
	}

	.bc-glyph {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: clamp(2.5rem, 6vw, 3.5rem);
		line-height: 1;
		color: color-mix(in srgb, var(--color-strong) 55%, var(--color-ink));
		pointer-events: none;
		user-select: none;
		transition: color 0.22s ease;
	}

	.bookcard:hover .bc-glyph {
		color: color-mix(in srgb, var(--color-strong) 85%, var(--color-ink));
	}

	/* spine: left-edge shadow gradient + embossed line */
	.bc-spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 9%;
		min-width: 10px;
		background: linear-gradient(
			to right,
			rgb(0 0 0 / 38%),
			rgb(0 0 0 / 8%) 55%,
			rgb(255 255 255 / 10%) 82%,
			transparent
		);
		pointer-events: none;
	}

	/* paper pages: right-edge slices (hover slightly fans them = the book opens a bit) */
	.bc-pages {
		position: absolute;
		top: 2.5%;
		bottom: 2.5%;
		right: 0;
		width: 7px;
		border-radius: 0 3px 3px 0;
		background: repeating-linear-gradient(
			to bottom,
			color-mix(in srgb, var(--color-ink) 12%, var(--color-bg-elevated)) 0 1px,
			var(--color-bg-elevated) 1px 3px
		);
		box-shadow: 1px 1px 2px rgb(0 0 0 / 25%);
		transition:
			translate 0.25s ease,
			width 0.25s ease;
		pointer-events: none;
	}

	.bookcard:hover .bc-pages {
		translate: 3px 0;
		width: 10px;
	}

	/* book belt: only a bottom scrim; the text is "printed" on the cover */
	.bc-band {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 2.25rem 0.9rem 0.8rem;
		background: linear-gradient(to top, rgb(0 0 0 / 66%) 30%, rgb(0 0 0 / 30%) 65%, transparent);
	}

	.bc-title {
		font-size: 0.9375rem;
		font-weight: 700;
		line-height: 1.35;
		color: #fff;
		text-shadow: 0 1px 2px rgb(0 0 0 / 45%);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.bc-meta {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		color: rgb(255 255 255 / 78%);
	}

	/* fine print below the book title (outside the frame, never covering the art) */
	.bc-sum {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: 0.6rem;
		padding-inline: 0.15rem;
		font-size: 0.8125rem;
		line-height: 1.55;
		color: var(--color-ink-muted);
	}
</style>
