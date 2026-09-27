<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import { page } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';
	import { reveal } from '$lib/animation/reveal';
	import { stagger } from '$lib/animation/stagger';
	import { maskReveal } from '$lib/animation/text';
	import { hoverPreview } from '$lib/animation/hover-preview';
	import { heroDrift, pinnedCards, tagCloudLite } from './about-fx';
	import SectionHeading from '$lib/components/SectionHeading.svelte';
	import PostRow from '$lib/components/PostRow.svelte';
	import TagLink from '$lib/components/TagLink.svelte';
	import type { HomeProps } from '../../contracts';

	let { posts, pinned, tags }: HomeProps = $props();

	const settings = $derived(page.data.settings);
	const heroBg = $derived(settings?.heroBg ?? '');
	const currentLocale = $derived(getLocale());
	const tagline = $derived((settings?.slogans?.[currentLocale] ?? '').trim() || m.site_tagline());
</script>

<ExtensionSlot name="home.hero" />

<section class="hero" data-animate="hero" use:heroDrift>
	<span class="hero-aurora" aria-hidden="true"></span>
	<span class="hero-wm" aria-hidden="true">{site.title.toUpperCase()}</span>
	{#if heroBg}
		<img class="hero-bg" src={heroBg} alt="" aria-hidden="true" fetchpriority="high" />
		<span class="hero-bg-fade" aria-hidden="true"></span>
	{/if}
	<div class="hero-inner">
		<img
			src={site.author.avatar}
			alt={`${site.title} avatar`}
			class="avatar"
			width="512"
			height="512"
			use:reveal={{ y: 16 }}
			data-animate="hero-avatar"
		/>
		<p class="brand" use:reveal={{ delay: 0.1 }} data-animate="hero-brand">
			{site.title.toUpperCase()}
		</p>
		<div class="mask-reveal">
			<h1 class="name" use:maskReveal data-animate="hero-title">{site.author.username}</h1>
		</div>
		<p class="tagline" use:reveal={{ delay: 0.2 }} data-animate="hero-tagline">{tagline}</p>
		<nav
			class="socials"
			use:reveal={{ delay: 0.3 }}
			data-animate="hero-socials"
			aria-label="social"
		>
			{#each site.socials as link (link.id)}
				<a
					href={link.url.startsWith('http') ? link.url : href(link.url)}
					target={link.url.startsWith('http') ? '_blank' : undefined}
					rel={link.url.startsWith('http') ? 'noreferrer' : undefined}
					class="social-link"
				>
					{#if link.display !== 'label' && link.icon && hasIcon(link.icon)}
						<SocialIcon name={link.icon} />
					{/if}
					{#if link.display !== 'icon'}
						<span>{link.label}</span>
					{/if}
				</a>
			{/each}
		</nav>
	</div>
	<a class="scroll-hint" href={href('/#posts')} aria-hidden="true" tabindex="-1"> ↓ </a>
</section>

{#if pinned.length > 0}
	<section class="pinned" aria-labelledby="pinned-heading" data-animate="pinned">
		<SectionHeading index="01">
			<span id="pinned-heading">{m.home_pinned()}</span>
		</SectionHeading>
		<div class="pinned-rail" style:--card-layout="1" use:pinnedCards>
			{#each pinned as post, i (post.slug)}
				<PostRow {post} index={i} glow />
			{/each}
		</div>
	</section>
{/if}

<section class="posts" id="posts" aria-labelledby="posts-heading">
	<SectionHeading index={pinned.length > 0 ? '02' : '01'}>
		<span id="posts-heading">{m.home_posts()}</span>
	</SectionHeading>

	<ul class="post-list" use:stagger={{ target: 'li' }} use:hoverPreview>
		{#each posts as post, i (post.slug)}
			<PostRow {post} index={i} />
		{/each}
	</ul>

	<p class="see-all-row">
		<a class="see-all" href={href('/blog')}>{m.blog_see_all()} →</a>
	</p>
</section>

{#if tags.length > 0}
	<section class="tags" aria-labelledby="tags-heading">
		<SectionHeading index="03">
			<span id="tags-heading">{m.home_tags()}</span>
		</SectionHeading>
		<div class="tag-list" use:tagCloudLite>
			{#each tags as tag (tag.name)}
				<TagLink name={tag.name} display={tag.display} count={tag.count} />
			{/each}
		</div>
	</section>
{/if}

<style>
	.hero {
		position: relative;
		padding: clamp(5rem, 15vh, 10rem) 1.5rem clamp(5.5rem, 13vh, 9rem);
		overflow: hidden;
		isolation: isolate;
	}

	/* aurora layer: gradient extracted for scroll parallax (Phase 42; drifts down slowly with drag)*/
	.hero-aurora {
		position: absolute;
		inset: -12% 0;
		z-index: -3;
		pointer-events: none;
		background:
			radial-gradient(
				ellipse 80% 60% at 72% 18%,
				color-mix(in srgb, var(--color-accent) 10%, transparent),
				transparent 62%
			),
			radial-gradient(
				ellipse 60% 50% at 12% 85%,
				color-mix(in srgb, #7c6cff 13%, transparent),
				transparent 70%
			);
	}

	.hero-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}

	.hero-bg-fade {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(to bottom, transparent 45%, var(--color-bg) 92%),
			radial-gradient(ellipse 70% 60% at 50% 30%, rgb(0 0 0 / 0.25), transparent 70%);
		pointer-events: none;
	}

	.hero-wm {
		position: absolute;
		right: 2vw;
		bottom: 8%;
		font-family: var(--font-display);
		font-size: clamp(5rem, 15vw, 13rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.02em;
		color: transparent;
		-webkit-text-stroke: 1px color-mix(in srgb, var(--color-ink) 7%, transparent);
		pointer-events: none;
		user-select: none;
		z-index: -1;
	}
	.hero-inner {
		position: relative;
		max-width: 80rem;
		margin: 0 auto;
	}

	.avatar {
		width: clamp(3rem, 5.5vw, 4.5rem);
		height: auto;
		aspect-ratio: 1;
		border-radius: 9999px;
		border: 1px solid var(--color-line);
		margin-bottom: 1.75rem;
		object-fit: cover;
		background: var(--color-bg-elevated);
	}

	.brand {
		margin: 0 0 0.375rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.32em;
		color: var(--color-ink-muted);
	}

	.name {
		font-family: var(--font-display);
		font-size: clamp(2.5rem, 6.5vw, 4.25rem);
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--color-ink);
	}

	.tagline {
		margin-top: 1.25rem;
		font-size: clamp(1rem, 2vw, 1.25rem);
		color: var(--color-ink-muted);
	}

	.socials {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.75rem;
		margin-top: 2rem;
	}

	.socials a {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.socials a:hover {
		color: var(--color-strong);
	}

	.scroll-hint {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		translate: -50% 0;
		color: var(--color-ink-muted);
		text-decoration: none;
		font-size: 1.25rem;
		animation: float 2.4s ease-in-out infinite;
	}

	@keyframes float {
		0%,
		100% {
			translate: -50% 0;
		}
		50% {
			translate: -50% 8px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.scroll-hint {
			animation: none;
		}
	}

	section.pinned,
	section.posts,
	section.tags {
		max-width: 80rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 6vh, 4rem) 1.5rem clamp(4rem, 10vh, 7rem);
	}

	.pinned-rail {
		container-type: style;
		display: flex;
		gap: 1.5rem;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		padding: 0.25rem 0.25rem 1.25rem;
		margin-bottom: 0.5rem;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: var(--color-line) transparent;
	}

	.pinned-rail :global(li) {
		flex: 0 0 min(25rem, 85vw);
		scroll-snap-align: start;
		min-width: 0;
	}

	/* glow/tilt converged into card.css + cardFx (Phase 54, data-glow hook) */

	section.pinned :global(.section-heading),
	section.posts :global(.section-heading),
	section.tags :global(.section-heading) {
		margin-bottom: 2rem;
	}

	.post-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	@container not style(--card-layout: 1) {
		.post-list :global(li:last-child) {
			border-bottom: 1px solid var(--color-line);
		}
	}

	/* post-row hover micro-slide: same "title slides + number tint" vocabulary as about */
	/* reading-list context: row mode (desktop mouse) neutralizes coverless decoration; mobile card mode keeps the gradient + ⌁ automatically */
	@container not style(--card-layout: 1) {
		.post-list :global(li.post-row-item .row-art--deco) {
			background: none;
		}

		.post-list :global(.card-glyph) {
			display: none;
		}
	}

	.post-list :global(.post-row:hover .row-title) {
		translate: 0.375rem 0;
		color: var(--color-strong);
	}
	.post-list :global(.row-title) {
		transition:
			translate 0.22s ease,
			color 0.22s ease;
	}
	.post-list :global(.post-row-item:hover .row-index) {
		color: var(--color-strong);
	}
	.post-list :global(.row-index) {
		transition: color 0.22s ease;
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 2.5rem;
	}

	.see-all-row {
		display: flex;
		justify-content: center;
		margin-top: 2.5rem;
	}

	/* view all posts: mono text link + underline slide-in (not a button; keeps the list vocabulary) */
	.see-all {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--color-line);
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.see-all:hover {
		color: var(--color-strong);
		border-color: var(--color-strong);
	}

	@media (max-width: 767px) {
		.pinned-rail {
			margin: 0 -1rem;
			padding-left: 1rem;
			padding-right: 1rem;
		}
	}
</style>
