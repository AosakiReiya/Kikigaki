<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { reveal } from '$lib/animation/reveal';
	import { maskReveal } from '$lib/animation/text';
	import PostBody from '$lib/components/PostBody.svelte';
	import type { PageProps } from '../../contracts';

	let { page }: PageProps = $props();
</script>

<article class="page" data-animate="custom-page">
	<header class="page-head">
		<a class="back" href={href('/')}>← {m.post_back()}</a>
		<div class="mask-reveal">
			<h1 use:maskReveal data-animate="page-title">{page.title}</h1>
		</div>
		{#if page.summary}
			<p class="page-summary" use:reveal={{ delay: 0.15, y: 12 }}>{page.summary}</p>
		{/if}
	</header>
	<div class="page-body">
		<PostBody html={page.contentHtml} />
	</div>
</article>

<style>
	.page {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vh, 6rem) 1.5rem 0;
	}

	.back {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		margin-bottom: 2.5rem;
		transition: color 0.2s ease;
	}

	.back:hover {
		color: var(--color-ink);
	}

	.page-head h1 {
		font-size: var(--text-h1);
		font-weight: 700;
		color: var(--color-ink);
	}

	.page-summary {
		margin-top: 1.25rem;
		font-size: 1.0625rem;
		color: var(--color-ink-muted);
		line-height: 1.7;
	}

	.page-body {
		margin-top: 3rem;
		padding-bottom: clamp(3rem, 8vh, 5rem);
	}
</style>
