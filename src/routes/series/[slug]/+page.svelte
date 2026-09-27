<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import { site } from '$lib/site';
	import { buildBook, buildBreadcrumb, ldScript } from '$lib/structured';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const Series = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).Series);

	const ldNodes = $derived(
		[
			buildBook(
				{ title: data.book.title, summary: data.book.summary, slug: data.book.slug },
				data.chapters.map((c) => ({ title: c.title, slug: c.slug })),
				getLocale()
			),
			buildBreadcrumb([
				{ name: m.nav_home(), url: site.url + '/' },
				{ name: m.nav_series(), url: site.url + '/series' },
				{ name: data.book.title, url: `${site.url}/series/${data.book.slug}` }
			])
		].map(ldScript)
	);
</script>

<svelte:head>
	<!-- prettier-ignore -->
	<!-- eslint-disable svelte/no-at-html-tags, no-useless-escape -- JSON-LD (< already \u003c) injected whole; trailing escapes are for template parsing -->
	{#each ldNodes as node (node)}
		{@html `<script type="application/ld+json">${node}<\/script>`}
	{/each}
	<!-- eslint-enable svelte/no-at-html-tags, no-useless-escape -->
</svelte:head>

<Series book={data.book} chapters={data.chapters} />
