<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import { buildItemList, ldScript } from '$lib/structured';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const SeriesIndex = $derived(
		resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).SeriesIndex
	);

	// SEO: series index page = CollectionPage + ItemList (this page's book list; Phase 63)
	const listLd = $derived(
		ldScript(
			buildItemList(
				'シリーズ一覧',
				data.series.map((b) => ({ title: b.title, slug: b.slug }))
			)
		)
	);
</script>

<svelte:head>
	<!-- prettier-ignore -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- JSON-LD (< already \u003c) injected whole -->
	{@html `<script type="application/ld+json">${listLd}<\/script>`}
</svelte:head>

<SeriesIndex series={data.series} page={data.page} totalPages={data.totalPages} />
