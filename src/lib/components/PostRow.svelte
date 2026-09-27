<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { formatDate } from '$lib/format';
	import type { PostSummary } from '$lib/server/content';
	import './card.css';

	/* * glow = interactive glow/tilt hook (enabled on the featured track and /blog grid); plain list rows don't carry it by default
	 *  the coverless decoration (gradient + ⌁) always renders; visibility is decided by the consuming context's container rules
	 *  (reading lists neutralize it in row mode — see Home/Series styles) */
	let {
		post,
		index,
		glow = false
	}: { post: PostSummary; index: number; glow?: boolean } = $props();

	let prefetched = false;

	/* * type display name (badges show for non-article only) */

	/* * preload the post page's cover on hover / pointerdown so the image doesn't pop in after the Flip transition */
	function prefetchCover() {
		if (prefetched || !post.cover) return;
		prefetched = true;
		const link = document.createElement('link');
		link.rel = 'prefetch';
		link.as = 'image';
		link.href = post.cover;
		document.head.appendChild(link);
	}
</script>

<li class="post-row-item" data-animate="post-row" data-preview-src={post.cover}>
	<a
		class="post-row"
		href={href(`/blog/${post.slug}`)}
		data-flip-id="post-{post.slug}"
		data-glow={glow ? '' : undefined}
		onpointerenter={prefetchCover}
		onpointerdown={prefetchCover}
	>
		<!-- art occupies space only with a cover (image + watermark ordinal); coverless = pure text card:
		     the ordinal shrinks and sits above the title, leaving no empty-image decoration (Phase 54 decoupling) -->
		<span class="row-art" class:row-art--deco={!post.cover}>
			{#if post.cover}
				<img
					class="row-cover"
					src={post.cover}
					alt=""
					width="1200"
					height="630"
					loading="lazy"
					decoding="async"
				/>
			{:else}
				<span class="card-glyph" aria-hidden="true">⌁</span>
			{/if}
			<span class="row-index">{String(index + 1).padStart(3, '0')}</span>
			{#if post.pinned}
				<span class="row-badge">{m.about_badge_pinned()}</span>
			{/if}
		</span>
		<span class="row-main">
			<span class="row-title">
				{post.title}
				{#if post.type !== 'article'}
					<span class="type-badge">{post.categoryDisplay}</span>
				{/if}
				{#if !post.translated}
					<span class="orig-badge">{m.badge_original()}</span>
				{/if}
			</span>
			{#if post.summary}
				<span class="row-summary">{post.summary}</span>
			{/if}
		</span>
		<span class="row-meta">
			<time class="row-date" datetime={post.date}>{formatDate(post.date)}</time>
			<span class="row-views" aria-hidden="true">
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					aria-hidden="true"
				>
					<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
					<circle cx="12" cy="12" r="2.8" />
				</svg>
				{post.views}
			</span>
			<span class="row-more" aria-hidden="true">{m.about_card_open()} →</span>
			<span class="row-tags" aria-label={m.nav_tags()}>
				{#each post.tags.slice(0, 2) as tag (tag.name)}
					<span class="tag">#{tag.display}</span>
				{/each}
			</span>
		</span>
	</a>
</li>

<style>
	.post-row-item {
		border-top: 1px solid var(--color-line);
		transition: border-color 0.35s ease;
	}

	.post-row {
		display: grid;
		grid-template-columns: 3.5rem 9rem 1fr auto;
		gap: 1.5rem;
		align-items: baseline;
		padding: 1.75rem 0.5rem;
		text-decoration: none;
		transition: background-color 0.25s ease;
	}

	.post-row:hover {
		background-color: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}

	/* desktop: art/meta flattened into grid children; the four-column layout stays (covers show only in card mode) */
	.row-art,
	.row-meta {
		display: contents;
	}

	.row-cover {
		display: none;
	}

	.row-more,
	.row-badge,
	.row-views {
		display: none;
	}

	/* desktop row layout: after flattening meta, date must return to the second column (non-card containers only — keeps featured cards clean) */
	@container not style(--card-layout: 1) {
		.row-date {
			grid-column: 2;
			grid-row: 1;
		}

		.row-main {
			grid-column: 3;
			grid-row: 1;
		}

		.row-tags {
			grid-column: 4;
			grid-row: 1;
		}
	}

	.row-index {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.row-date {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.row-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.orig-badge {
		display: inline-block;
		vertical-align: 0.15em;
		margin-left: 0.5rem;
		padding: 0.0625rem 0.4375rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.04em;
		color: var(--color-ink-muted);
	}

	/* content-type badge (Phase 52a; appears for non-article only): strong-outlined small label */
	.type-badge {
		display: inline-block;
		vertical-align: 0.15em;
		margin-left: 0.5rem;
		padding: 0.0625rem 0.4375rem;
		border: 1px solid color-mix(in srgb, var(--color-strong) 45%, transparent);
		border-radius: 9999px;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.04em;
		color: var(--color-strong);
	}

	.row-summary {
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.row-tags {
		display: flex;
		gap: 0.75rem;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	/* card mode (touch / narrow screens / UA tablets all set --card-layout=1, see layout.css and app.html):
	   the multi-column grid flexes automatically with width */
	@container style(--card-layout: 1) {
		:global(.post-list) {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
			gap: 1.25rem;
		}

		:global(.post-list > .post-row-item) {
			margin: 0;
			min-width: 0;
		}

		.post-row-item {
			border-top: none;
		}

		.post-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.25rem;
			padding: 0;
			border: 1px solid var(--color-line);
			border-radius: 1rem;
			overflow: hidden;
			background: var(--color-bg-elevated);
			height: 100%;
			min-width: 0;
		}

		.post-row {
			position: relative;
			transition:
				border-color 0.22s,
				box-shadow 0.22s,
				background-color 0.25s ease;
		}

		.post-row:hover {
			border-color: color-mix(in srgb, var(--color-strong) 50%, var(--color-line));
			box-shadow: var(--shadow-card-hover);
		}

		.row-art {
			display: block;
			position: relative;
			aspect-ratio: 16 / 9;
			margin: 0.85rem 0.85rem 0;
			overflow: hidden;
			border-radius: 0.7rem;
			background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		}

		.row-cover {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: cover;
			transition: scale 0.5s cubic-bezier(0.22, 1, 0.36, 1);
		}

		.post-row:hover .row-cover {
			scale: 1.06;
		}

		.row-index {
			display: block;
			position: absolute;
			right: 0.55rem;
			bottom: 0.05rem;
			font-family: var(--font-display);
			font-size: 4.2rem;
			font-weight: 800;
			line-height: 1;
			color: transparent;
			-webkit-text-stroke: 1px color-mix(in srgb, var(--color-ink) 30%, transparent);
			pointer-events: none;
			transition: -webkit-text-stroke-color 0.22s ease;
		}

		.post-row:hover .row-index {
			-webkit-text-stroke-color: var(--color-strong);
		}

		.row-badge {
			display: block;
			position: absolute;
			top: 0.55rem;
			left: 0.55rem;
			font-family: var(--font-mono);
			font-size: 0.62rem;
			letter-spacing: 0.08em;
			padding: 0.12rem 0.5rem;
			border-radius: 9999px;
			border: 1px solid color-mix(in srgb, var(--color-strong) 40%, transparent);
			background: color-mix(in srgb, var(--color-bg) 72%, transparent);
			color: var(--color-strong);
		}

		.row-views {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
			font-family: var(--font-mono);
			font-size: 0.75rem;
			font-variant-numeric: tabular-nums;
			color: var(--color-ink-muted);
		}

		.row-views svg {
			opacity: 0.75;
		}

		.row-meta {
			display: flex;
			align-items: center;
			gap: 0.9rem;
			padding: 0.7rem 1.25rem 1.15rem;
		}

		.row-more {
			display: block;
			order: 1;
			margin-left: auto;
			font-size: 0.7rem;
			color: var(--color-strong);
			opacity: 0;
			transform: translateX(-4px);
			transition:
				opacity 0.2s,
				transform 0.2s;
		}

		.post-row:hover .row-more {
			opacity: 1;
			transform: none;
		}

		.row-main {
			padding: 0.9rem 1.25rem 0;
		}

		.row-title {
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}

		.row-summary {
			-webkit-line-clamp: 2;
			line-clamp: 2;
		}

		/* containment: long mixed titles / many nowrap tags must not burst the card frame (track already minmax(0,1fr); children add their own floor) */
		.row-main,
		.row-meta,
		.row-art {
			max-width: 100%;
		}

		.row-title,
		.row-summary {
			overflow-wrap: anywhere;
		}

		.row-meta {
			flex-wrap: wrap;
			row-gap: 0.4rem;
		}

		.row-tags {
			min-width: 0;
			flex-wrap: wrap;
		}
	}
</style>
