<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// thin adapter: data → the current pack's Search slot
	const Search = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme).Search);
</script>

<Search
	query={data.query}
	results={data.results}
	total={data.total}
	page={data.page}
	totalPages={data.totalPages}
/>
