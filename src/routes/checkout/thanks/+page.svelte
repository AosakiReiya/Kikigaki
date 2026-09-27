<script lang="ts">
	/* * 79e checkout callback page: paid lists delivery links; pending explains; unknown reassures. */
	import { m } from '$lib/paraglide/messages.js';
	import { href } from '$lib/nav';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="th">
	{#if data.status === 'paid' && data.kind === 'tip' && data.items.length === 0}
		<h1>💛</h1>
		<p class="tip">{m.support_thanks()}</p>
	{:else if data.status === 'paid' && data.items.length > 0}
		<h1>{m.checkout_thanks_title()}</h1>
		<ul class="dl">
			{#each data.items as it (it.token)}
				<li>
					<span class="t">{it.title}</span>
					<a class="btn" href={`/api/download/${it.token}`}>⬇ {m.checkout_download()}</a>
				</li>
			{/each}
		</ul>
	{:else if data.status === 'paid'}
		<h1>{m.checkout_thanks_title()}</h1>
		<p>{m.checkout_pending()}</p>
	{:else if data.status === 'pending'}
		<h1>{m.checkout_pending()}</h1>
	{:else}
		<h1>{m.checkout_notfound()}</h1>
	{/if}
	<p class="back"><a href={href('/')}>← {m.nav_home()}</a></p>
</section>

<style>
	.tip {
		font-size: 1.125rem;
	}
	.th {
		max-width: 40rem;
		margin: 0 auto;
		padding: clamp(4rem, 12vh, 8rem) 1.5rem;
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		margin-bottom: 1.5rem;
		line-height: 1.3;
	}
	.dl {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.dl li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		padding: 0.8rem 0;
		border-bottom: 1px solid var(--color-line);
	}
	.t {
		font-weight: 600;
	}
	.btn {
		flex: none;
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--color-ink);
		color: var(--color-ink);
		text-decoration: none;
		font-size: 0.8125rem;
	}
	.btn:hover {
		background: var(--color-accent);
		color: var(--color-accent-ink);
	}
	.back {
		margin-top: 2rem;
	}
	.back a {
		color: var(--color-ink-muted);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
</style>
