<script lang="ts">
	/**
	 * P83a — Renders the components assigned to a named slot (site setting
	 * `slot_assignments`). Fail-silent: unknown slot/component ids render
	 * nothing, so a bad assignment can never break a public page.
	 */
	import { page } from '$app/state';
	import { BUILTIN_SLOT_COMPONENTS } from '$lib/slots/registry';
	import DbSlotComponent from './DbSlotComponent.svelte';
	import type { SlotName } from '$lib/slots/catalog';

	let { name }: { name: SlotName } = $props();

	const assignments = $derived<string[]>(page.data.settings?.slotAssignments?.[name] ?? []);
</script>

{#each assignments as id (id)}
	{@const C = BUILTIN_SLOT_COMPONENTS[id]}
	{#if C}
		<C />
	{:else}
		<DbSlotComponent {id} />
	{/if}
{/each}
