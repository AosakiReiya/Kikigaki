<script lang="ts">
	/* * 79e cart page: pure front-end list + whole-cart checkout (prices recomputed server-side at settlement). */
	import { m } from '$lib/paraglide/messages.js';
	import { href } from '$lib/nav';
	import { cartItems, cartRemove } from '$lib/stores/cart.svelte';

	let busy = $state(false);
	let note = $state('');

	async function checkoutAll() {
		busy = true;
		note = '';
		try {
			const r = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					items: cartItems().map((l) => ({ typeKey: l.typeKey, slug: l.slug }))
				})
			});
			const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
			if (j.url) {
				location.href = j.url;
				return;
			}
			note = j.error === 'checkout_not_configured' ? m.shop_not_for_sale() : (j.error ?? 'error');
		} catch {
			note = 'network';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="cart">
	<h1>{m.cart_view()}</h1>
	{#if cartItems().length === 0}
		<p class="muted">{m.cart_empty()}</p>
	{:else}
		<ul>
			{#each cartItems() as l (`${l.typeKey}/${l.slug}`)}
				<li>
					<a href={href(`/${l.typeKey}/${l.slug}`)}>{l.title}</a>
					<span class="p">{l.price}</span>
					<button type="button" class="mini" onclick={() => cartRemove(l.typeKey, l.slug)}
						>{m.cart_remove()}</button
					>
				</li>
			{/each}
		</ul>
		<div class="foot">
			<button type="button" class="primary" disabled={busy} onclick={checkoutAll}
				>{m.cart_checkout()}</button
			>
			{#if note}<span class="muted">{note}</span>{/if}
		</div>
	{/if}
</section>

<style>
	.cart {
		max-width: 44rem;
		margin: 0 auto;
		padding: clamp(3.5rem, 9vh, 6rem) 1.5rem;
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(1.875rem, 4.5vw, 2.75rem);
		padding-bottom: 0.9rem;
		border-bottom: 3px solid var(--color-ink);
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 1rem 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--color-line);
	}
	li a {
		flex: 1;
		color: var(--color-ink);
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-weight: 600;
		text-decoration: none;
	}
	.p {
		font-family: var(--font-mono);
		font-size: 0.875rem;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.5rem;
	}
	.primary {
		border: 1px solid var(--color-accent);
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		padding: 0.55rem 1.2rem;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.5;
	}
	.mini {
		background: none;
		border: 1px solid var(--color-line);
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.muted {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
	}
</style>
