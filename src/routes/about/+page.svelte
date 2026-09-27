<script lang="ts">
	/* * about page (Phase 40): thin adapter; structure belongs to the theme pack (resolvePack().About, same shape as home). */
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const About = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).About);
</script>

<svelte:head>
	<title>關於 — Kikigaki</title>
</svelte:head>

<About aboutHtml={data.aboutHtml} stats={data.stats} showcase={data.showcase} tags={data.tags} />
