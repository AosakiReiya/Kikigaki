<script lang="ts">
	/** shop pack: storefront display for the products type (2-3 column card grid + prices). Data source = the 79 registry. */
	import { href } from '$lib/nav';
	import { cartItems } from '$lib/stores/cart.svelte';
	import type { GenericListProps } from '../../contracts';

	let { typeKey, label, titleField, items }: GenericListProps = $props();

	const money = (p: unknown) => (typeof p === 'string' ? p : '');
	const n = () => cartItems().length;

	function titleOf(data: Record<string, unknown>): string {
		return String(data[titleField] ?? '');
	}
</script>

<section class="grid-head">
	<h1>{label}</h1>
	<a class="cart-pill" href={href('/cart')}>🧺 {n() > 0 ? n() : ''}</a>
</section>

{#if items.length === 0}
	<p class="empty">目前沒有上架商品。</p>
{:else}
	<ul class="shelf">
		{#each items as it (it.id)}
			<li>
				<a class="card" href={href(`/${typeKey}/${it.slug}`)}>
					{#if typeof it.data.cover === 'string' && it.data.cover}
						<img src={String(it.data.cover)} alt="" loading="lazy" width="800" height="520" />
					{:else}
						<span class="ph" aria-hidden="true">{titleOf(it.data).slice(0, 1)}</span>
					{/if}
					<span class="meta">
						<span class="t">{titleOf(it.data)}</span>
						<span class="p">{money(it.data.price)}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.grid-head {
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vh, 5rem) 1.5rem 0;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(2rem, 5vw, 3rem);
		letter-spacing: -0.02em;
	}
	.cart-pill {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		text-decoration: none;
		color: var(--color-ink);
	}
	.cart-pill:hover {
		border-color: var(--color-accent);
	}
	.empty {
		max-width: 72rem;
		margin: 2rem auto;
		padding: 0 1.5rem;
		color: var(--color-ink-muted);
	}
	.shelf {
		list-style: none;
		max-width: 72rem;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1.5rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		text-decoration: none;
		color: var(--color-ink);
		transition:
			border-color 0.2s ease,
			transform 0.2s ease;
	}
	.card:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
	}
	.card img {
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}
	.ph {
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 10;
		font-family: var(--font-display);
		font-size: 3rem;
		background: linear-gradient(135deg, var(--color-accent), var(--color-bg-elevated));
		color: var(--color-accent-ink);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.8rem 1rem;
	}
	.t {
		font-weight: 600;
	}
	.p {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-accent);
		flex: none;
	}
</style>
