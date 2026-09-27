<script lang="ts">
	/**
	 * Combobox (Phase 58.2): a stylized select-or-type dropdown.
	 * Free-text input + dropdown filtering; keyboard ↑↓ / Enter / Esc; outside click closes.
	 */

	export interface ComboOption {
		value: string;
		label: string;
		hint?: string;
	}

	let {
		options,
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		emptyText = '—'
	}: {
		options: ComboOption[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		emptyText?: string;
	} = $props();

	let open = $state(false);
	let cursor = $state(0);
	let root = $state<HTMLDivElement>();

	const filtered = $derived(
		value.trim()
			? options.filter(
					(o) =>
						o.value.toLowerCase().includes(value.trim().toLowerCase()) ||
						o.label.toLowerCase().includes(value.trim().toLowerCase())
				)
			: options
	);

	$effect(() => {
		if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
	});

	function pick(o: ComboOption) {
		value = o.value;
		open = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open) open = true;
			else cursor = Math.min(cursor + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(cursor - 1, 0);
		} else if (e.key === 'Enter' && open && filtered[cursor]) {
			e.preventDefault();
			pick(filtered[cursor]);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	$effect(() => {
		if (!open) return;
		const ondoc = (ev: MouseEvent) => {
			if (root && !root.contains(ev.target as Node)) open = false;
		};
		document.addEventListener('mousedown', ondoc);
		return () => document.removeEventListener('mousedown', ondoc);
	});

	const listId = 'combo-list-' + Math.random().toString(36).slice(2, 8);
</script>

<div class="combo" bind:this={root}>
	<input
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		{placeholder}
		bind:value
		{disabled}
		onfocus={() => (open = true)}
		oninput={() => {
			open = true;
			cursor = 0;
		}}
		{onkeydown}
	/>
	<button
		type="button"
		class="caret"
		tabindex="-1"
		aria-hidden="true"
		onclick={() => (open = !open)}>▾</button
	>
	{#if open}
		<ul class="list" id={listId} role="listbox">
			{#if filtered.length === 0}
				<li class="none">{emptyText}</li>
			{:else}
				{#each filtered as o, i (o.value)}
					<li
						role="option"
						aria-selected={i === cursor}
						class:item={true}
						class:hi={i === cursor}
						onmousedown={(e) => {
							e.preventDefault();
							pick(o);
						}}
						onmouseenter={() => (cursor = i)}
					>
						<span class="v">{o.value}</span>
						<span class="l">{o.label}</span>
						{#if o.hint}<span class="h">{o.hint}</span>{/if}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.combo {
		position: relative;
		display: inline-flex;
		min-width: 14rem;
	}

	input {
		flex: 1;
		padding: 0.4rem 1.8rem 0.4rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
		font-family: inherit;
	}

	input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.caret {
		position: absolute;
		right: 0.15rem;
		top: 50%;
		transform: translateY(-50%);
		border: none;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
	}

	.list {
		position: absolute;
		inset-inline: 0;
		top: calc(100% + 0.3rem);
		z-index: 40;
		max-height: 17rem;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		border: 1px solid var(--color-line);
		border-radius: 0.6rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
	}

	.item {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.35rem 0.55rem;
		border-radius: 0.4rem;
		cursor: pointer;
		font-size: 0.8125rem;
	}

	.item.hi {
		background: color-mix(in oklab, var(--color-strong) 14%, transparent);
	}

	.v {
		font-family: var(--font-mono);
		color: var(--color-strong);
		flex-shrink: 0;
	}

	.l {
		color: var(--color-ink);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.h {
		margin-left: auto;
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		flex-shrink: 0;
	}

	.none {
		padding: 0.4rem 0.55rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
