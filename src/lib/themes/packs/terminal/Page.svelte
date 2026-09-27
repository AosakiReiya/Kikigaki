<script lang="ts">
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import PostBody from '$lib/components/PostBody.svelte';
	import type { PageProps } from '../../contracts';

	let { page }: PageProps = $props();

	const man = `${site.title.toLowerCase()}(7)`.toUpperCase();
</script>

<article class="t-page">
	<div class="t-man-head">
		<span class="t-man-left">{man}</span>
		<span class="t-man-center">{page.title}</span>
		<span class="t-man-right">{man}</span>
	</div>

	<section class="t-sec">
		<h2 class="t-sec-h">NAME</h2>
		<p class="t-sec-b">
			<span class="t-syn">/{page.slug}</span> — {page.summary || '使用者自訂頁面'}
		</p>
	</section>

	<section class="t-sec t-desc">
		<h2 class="t-sec-h">DESCRIPTION</h2>
		<PostBody html={page.contentHtml} />
	</section>

	<p class="t-exit"><a href={href('/')}>$ cd ~</a></p>
</article>

<style>
	.t-page {
		max-width: 68rem;
		margin: 0 auto;
		padding: clamp(2rem, 6vh, 3.5rem) 1.25rem 0;
		font-family: var(--font-mono);
	}

	.t-man-head {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		border-bottom: 1px solid var(--color-line);
		padding-bottom: 0.4rem;
		letter-spacing: 0.04em;
	}

	.t-man-center {
		color: var(--color-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 40ch;
	}

	.t-man-right {
		text-align: right;
	}

	.t-sec {
		margin-top: 1.75rem;
	}

	.t-sec-h {
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		color: var(--color-strong);
		margin: 0 0 0.5rem;
		font-weight: 700;
	}

	.t-sec-b {
		font-size: 0.9rem;
		color: var(--color-ink);
		margin: 0;
		line-height: 1.7;
	}

	.t-syn {
		color: var(--color-strong);
	}

	.t-desc {
		margin-top: 2.25rem;
	}

	.t-exit {
		margin-top: 2.5rem;
		border-top: 1px solid var(--color-line);
		padding-top: 1rem;
		font-size: 0.85rem;
	}

	.t-exit a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.t-exit a:hover {
		color: var(--color-strong);
	}
</style>
