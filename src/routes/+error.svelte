<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { page } from '$app/state';

	const notFound = page.status === 404;
</script>

<svelte:head>
	{#if page.status >= 500}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

<section class="error">
	<p class="code" data-animate="error-code">{page.status}</p>
	<h1>{notFound ? m.error_not_found() : m.error_generic()}</h1>
	<a class="link-animated" href={href('/')}>{m.error_back_home()}</a>
</section>

<style>
	.error {
		max-width: 80rem;
		margin: 0 auto;
		padding: clamp(5rem, 18vh, 11rem) 1.5rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
	}

	.code {
		font-family: var(--font-display);
		font-size: clamp(5rem, 18vw, 12rem);
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--color-ink);
	}

	h1 {
		font-family: var(--font-body);
		font-size: clamp(1.125rem, 3vw, 1.5rem);
		font-weight: 400;
		letter-spacing: 0;
		color: var(--color-ink-muted);
	}

	a {
		margin-top: 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink);
	}
</style>
