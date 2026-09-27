<script lang="ts">
	/* * 79e-2 multi-provider: pick one to attach the checkout. Single-provider sites never reach this page. */
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state('');

	const LABELS: Record<string, string> = {
		stripe: 'Stripe',
		paypal: 'PayPal',
		airwallex: 'Airwallex 空中云汇',
		mock: 'Mock（示範）'
	};

	const money = (c: number, cur: string) =>
		cur === 'jpy' || cur === 'twd'
			? `${cur.toUpperCase()} ${c}`
			: `${cur.toUpperCase()} ${(c / 100).toFixed(2)}`;

	async function pick(name: string) {
		busy = name;
		const r = await fetch('/api/checkout/select', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ orderId: data.order?.id, provider: name })
		});
		const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
		if (j.url) {
			location.href = j.url;
			return;
		}
		busy = '';
		note = j.error ?? 'error';
	}
	let note = $state('');
</script>

{#if !data.order || data.providers.length < 2}
	<p class="bad">{m.checkout_pick_none()}</p>
{:else}
	<section class="pick">
		<h1>{m.checkout_pick_title()}</h1>
		<p class="amt">{money(data.order.totalCents, data.order.currency)}</p>
		<ul>
			{#each data.providers as name (name)}
				<li>
					<button class="opt" disabled={!!busy} onclick={() => pick(name)}>
						<span class="nm">{LABELS[name] ?? name}</span>
						{#if busy === name}<span class="spin">…</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
		{#if note}<p class="bad">{note}</p>{/if}
	</section>
{/if}

<style>
	.pick {
		max-width: 30rem;
		margin: 0 auto;
		padding: clamp(4rem, 12vh, 7rem) 1.5rem;
		text-align: center;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 1.6rem;
	}
	.amt {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		color: var(--color-accent);
		margin: 0.6rem 0 1.6rem;
	}
	ul {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.7rem;
	}
	.opt {
		width: 100%;
		padding: 0.9rem 1.1rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 1rem;
		cursor: pointer;
		display: flex;
		justify-content: center;
		gap: 0.6rem;
	}
	.opt:hover:not(:disabled) {
		border-color: var(--color-accent);
	}
	.bad {
		max-width: 30rem;
		margin: 3rem auto;
		text-align: center;
		color: var(--color-ink-muted);
	}
</style>
