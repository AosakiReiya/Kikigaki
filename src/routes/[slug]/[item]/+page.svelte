<script lang="ts">
	/* * 79d: dynamic entry detail — packs may override the layout via the ItemDetail slot; default is neutral newspaper typesetting. */
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import GenericItemDetail from '$lib/components/GenericItemDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const pack = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme));
</script>

<svelte:head>
	<!-- prettier-ignore -->
	<!-- eslint-disable svelte/no-at-html-tags, no-useless-escape -- JSON-LD (< is already \u003c) injected as a whole block -->
	{#each data.ldNodes ?? [] as node (node)}
		{@html `<script type="application/ld+json">${node}<\/script>`}
	{/each}
	<!-- eslint-enable svelte/no-at-html-tags, no-useless-escape -->
</svelte:head>

{#if pack.ItemDetail}
	<svelte:component this={pack.ItemDetail} {...data.genericItem} />
{:else}
	<GenericItemDetail {...data.genericItem} />
{/if}
