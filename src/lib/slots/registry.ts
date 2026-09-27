/**
 * P83a — Built-in slot component registry (client bundle only; never import
 * from server modules). DB custom components become assignable in P83c.
 */
import type { Component } from 'svelte';
import SupportZone from '$lib/components/SupportZone.svelte';

export const BUILTIN_SLOT_COMPONENTS: Record<string, Component<Record<string, unknown>>> = {
	'support-zone': SupportZone as unknown as Component<Record<string, unknown>>
};
