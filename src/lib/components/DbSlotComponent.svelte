<script lang="ts">
	/**
	 * P83c — Renders a DB custom component inside a slot via the same public
	 * pipeline as :::name embeds (client-side compile from /api/components/code,
	 * enabled+approved only). Fail-silent: missing/broken renders nothing.
	 */
	import { ensureCustomComponent } from '$lib/workshop/custom-registry';
	import type { Component } from 'svelte';

	let { id }: { id: string } = $props();
	let C = $state<Component | null>(null);

	$effect(() => {
		let alive = true;
		ensureCustomComponent(id).then((c) => {
			if (alive) C = c;
		});
		return () => {
			alive = false;
		};
	});
</script>

{#if C}
	{@const D = C}
	<D />
{/if}
