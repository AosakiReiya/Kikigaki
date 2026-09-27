<script lang="ts">
	/**
	 * 79e-3 support card (lofi style): three presets + custom + message.
	 * Since P83a slot assignment is the render gate (no gate = mounted means shown); the standalone
	 * page (/support) passes gate='support' keeping the supportSurfaces check.
	 */
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	let { gate = '', compact = false }: { gate?: string; compact?: boolean } = $props();

	// No gate = slot-rendered (assignment is the consent). gate='support' keeps
	// the legacy supportSurfaces check for the standalone /support page.
	const on = $derived(
		!gate ||
			((page.data.settings?.supportSurfaces ?? '') as string)
				.split(',')
				.map((x: string) => x.trim())
				.includes(gate)
	);

	let amount = $state('');
	let message = $state('');
	let busy = $state(false);
	let note = $state('');

	const PRESETS = ['3.00', '5.00', '10.00'];

	async function send(custom: string | null) {
		if (busy) return;
		const amt = custom ?? amount;
		if (!/^(\d{1,3})(\.\d{2})?$/.test(amt.trim())) {
			note = m.support_bad_amount();
			return;
		}
		busy = true;
		note = '';
		try {
			const r = await fetch('/api/support', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ amount: amt.trim(), message: message.trim() })
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
</script>

{#if on}
	<aside class="zone" class:compact>
		<p class="lead">☕ {m.support_title()}</p>
		<p class="sub">{page.data.settings?.supportIntro || m.support_sub()}</p>
		<div class="picks">
			{#each PRESETS as p (p)}
				<button class="amt" disabled={busy} onclick={() => send(p)}>{Number(p)}</button>
			{/each}
			<span class="custom">
				<input
					type="text"
					inputmode="decimal"
					maxlength="6"
					placeholder={m.support_custom()}
					aria-label={m.support_custom()}
					bind:value={amount}
				/>
				<button class="go" disabled={busy || !amount.trim()} onclick={() => send(null)}
					>{m.support_send()}</button
				>
			</span>
		</div>
		{#if !compact}
			<input
				class="msg"
				type="text"
				maxlength={280}
				placeholder={m.support_msg_ph()}
				bind:value={message}
			/>
		{/if}
		{#if note}<p class="note">{note}</p>{/if}
	</aside>
{/if}

<style>
	.zone {
		max-width: 46rem;
		margin: 3rem auto 0;
		padding: 1.4rem 1.5rem;
		border: 1px dashed var(--color-line);
		background: var(--color-bg-elevated);
	}
	.zone.compact {
		margin-top: 1.5rem;
		padding: 1rem 1.1rem;
	}
	.lead {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.0625rem;
	}
	.sub {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-top: 0.15rem;
	}
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		align-items: center;
		margin-top: 0.9rem;
	}
	.amt,
	.go {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		padding: 0.45rem 0.95rem;
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink);
		cursor: pointer;
	}
	.amt:hover:not(:disabled),
	.go:hover:not(:disabled) {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.custom {
		display: inline-flex;
		gap: 0.35rem;
		margin-left: auto;
	}
	.custom input {
		width: 5.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		color: var(--color-ink);
	}
	.msg {
		width: 100%;
		margin-top: 0.7rem;
		font-size: 0.8125rem;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		color: var(--color-ink);
	}
	.note {
		margin-top: 0.6rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
</style>
