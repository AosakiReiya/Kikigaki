<script lang="ts">
	/**
	 * 79e product-card buy row: buy now (single-item direct checkout) + add to cart.
	 * Without configured keys the backend returns 503 → shows "not on sale yet" inline instead of a dead button.
	 */
	import { m } from '$lib/paraglide/messages.js';
	import { cartAdd, cartItems } from '$lib/stores/cart.svelte';

	let {
		typeKey,
		slug,
		title,
		price
	}: { typeKey: string; slug: string; title: string; price: string } = $props();

	let busy = $state(false);
	let note = $state('');

	$effect(() => {
		if (note) {
			const t = setTimeout(() => (note = ''), 3200);
			return () => clearTimeout(t);
		}
	});

	async function buyNow() {
		busy = true;
		note = '';
		try {
			const r = await fetch('/api/checkout', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ items: [{ typeKey, slug }] })
			});
			const j = (await r.json().catch(() => ({}))) as {
				url?: string;
				select?: string;
				error?: string;
			};
			const dest = j.url ?? j.select;
			if (dest) {
				location.href = dest;
				return;
			}
			note = j.error === 'checkout_not_configured' ? m.shop_not_for_sale() : (j.error ?? 'error');
		} catch {
			note = 'network';
		} finally {
			busy = false;
		}
	}

	function addToCart() {
		const added = cartAdd({ typeKey, slug, title, price });
		note = added ? m.cart_added() : m.cart_incart();
	}
</script>

<div class="buy">
	<span class="price">{price}</span>
	<button type="button" class="primary" disabled={busy} onclick={buyNow}>{m.cart_checkout()}</button
	>
	<button type="button" class="ghost" onclick={addToCart}>{m.cart_add()}</button>
	{#if note}<span class="note" role="status">{note}</span>{/if}
	{#if cartItems().length}<a class="cart-link" href="/cart"
			>{m.cart_view()} · {cartItems().length}</a
		>{/if}
</div>

<style>
	.buy {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin: 1.25rem 0;
		padding: 1rem 1.25rem;
		border: 1px solid var(--color-line);
		border-left: 4px solid var(--color-accent);
		background: var(--color-bg-elevated);
	}
	.price {
		font-family: var(--font-mono);
		font-size: 1.25rem;
		font-weight: 600;
		min-width: 5rem;
	}
	button {
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
	}
	.primary {
		border: 1px solid var(--color-accent);
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
	}
	.primary:disabled {
		opacity: 0.5;
	}
	.ghost {
		background: none;
		border: 1px solid var(--color-line);
		color: var(--color-ink);
	}
	.note {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
	.cart-link {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
</style>
