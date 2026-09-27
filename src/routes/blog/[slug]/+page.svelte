<script lang="ts">
	import { page } from '$app/state';
	import { site } from '$lib/site';
	import { buildArticle, buildBreadcrumb, ldScript } from '$lib/structured';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const post = $derived(data.post);

	/* * JSON-LD (Phase 63): Article type overridable + breadcrumbs; nullable dates = omitted fields */
	const ldNodes = $derived(
		[
			buildArticle({
				schemaType: data.seoLite.schemaType,
				title: post.title,
				description: post.summary,
				images: [data.seoLite.ogImage, post.cover],
				datePublished: post.date,
				dateModified: post.updatedAt,
				authorName: data.seoLite.author,
				url: `${site.url}/blog/${post.slug}`,
				locale: getLocale(),
				section: post.categoryDisplay,
				tags: post.tags.map((t) => t.display || t.name),
				series: data.seriesBooks.map((bk) => ({ title: bk.title, slug: bk.slug }))
			}),
			buildBreadcrumb([
				{ name: m.nav_home(), url: site.url + '/' },
				{
					name: post.categoryDisplay,
					url: `${site.url}/blog?type=${encodeURIComponent(post.type)}`
				},
				{ name: post.title, url: `${site.url}/blog/${post.slug}` }
			])
		].map(ldScript)
	);

	const Post = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).Post);
</script>

<svelte:head>
	<!-- prettier-ignore -->
	<!-- eslint-disable svelte/no-at-html-tags, no-useless-escape -- JSON-LD (< already \u003c) injected whole; trailing escapes are for template parsing -->
	{#each ldNodes as node (node)}
		{@html `<script type="application/ld+json">${node}<\/script>`}
	{/each}
	<!-- eslint-enable svelte/no-at-html-tags, no-useless-escape -->
</svelte:head>

<Post {post} adjacent={data.adjacent} seriesBooks={data.seriesBooks} />
