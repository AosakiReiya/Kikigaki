<script lang="ts">
	/* * capsule toggle (admin form vocabulary; replaces bare checkboxes) */
	let {
		checked = $bindable(false),
		label = '',
		disabled = false
	}: { checked?: boolean; label?: string; disabled?: boolean } = $props();
</script>

<label class="switch" class:on={checked}>
	<input type="checkbox" bind:checked {disabled} />
	<span class="track" aria-hidden="true"><span class="knob"></span></span>
	{#if label}<span class="lbl">{label}</span>{/if}
</label>

<style>
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		user-select: none;
	}

	.switch.on {
		cursor: pointer;
	}

	input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.track {
		position: relative;
		width: 2.25rem;
		height: 1.25rem;
		border-radius: 999px;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		transition:
			background 0.18s ease,
			border-color 0.18s ease;
		flex-shrink: 0;
	}

	.knob {
		position: absolute;
		top: 50%;
		left: 2px;
		width: calc(1.25rem - 6px);
		height: calc(1.25rem - 6px);
		border-radius: 50%;
		background: var(--color-ink-muted);
		transform: translateY(-50%);
		transition:
			transform 0.18s ease,
			background 0.18s ease;
	}

	.on .track {
		background: color-mix(in oklab, var(--color-strong) 25%, var(--color-bg));
		border-color: var(--color-strong);
	}

	.on .knob {
		transform: translate(0.95rem, -50%);
		background: var(--color-strong);
	}

	input:focus-visible + .track {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.lbl {
		font-size: 0.8125rem;
		color: var(--color-ink);
	}
</style>
