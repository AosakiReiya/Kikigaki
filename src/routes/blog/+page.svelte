<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// thin adapter: data → the current pack's Blog slot (filter/pagination state all lives in the URL)
	const Blog = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).Blog);
</script>

<Blog
	posts={data.posts}
	total={data.total}
	page={data.page}
	totalPages={data.totalPages}
	tags={data.tags}
	years={data.years}
	categories={data.categories}
	series={data.series}
	filter={data.filter}
	query={data.query}
/>
