<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import { buildWebSite, ldScript } from '$lib/structured';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// thin adapter: data → the current pack's Home slot (structure belongs to themes, loading to routes)
	const Home = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).Home);

	// SEO: WebSite + SearchAction (Phase 63; site-level identity, home page represents)
	const webSiteLd = $derived(ldScript(buildWebSite()));
</script>

<svelte:head>
	<!-- prettier-ignore -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- JSON-LD (< already \u003c) injected whole -->
	{@html `<script type="application/ld+json">${webSiteLd}<\/script>`}
</svelte:head>

<Home posts={data.posts} pinned={data.pinned} tags={data.tags} />
