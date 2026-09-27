<script lang="ts">
	import { page } from '$app/state';
	import { resolvePack } from '$lib/themes/db-registry.svelte';
	import GenericItemList from '$lib/components/GenericItemList.svelte';
	import { getThemePreview } from '$lib/themes/preview.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const pack = $derived(resolvePack(getThemePreview() ?? page.data.settings?.uiTheme));
	const Page = $derived(pack.Page);
	const RouteSurface = $derived(
		data.themeRoute ? pack.extra?.[data.themeRoute.surface] : undefined
	);
</script>

{#if data.themeRoute}
	{#if RouteSurface}
		<RouteSurface
			slug={data.themeRoute.path}
			content={data.content}
			themeContent={data.themeContent}
		/>
	{:else}
		<!-- theme declared routes but the implementation is missing: give the owner a readable degradation, not a 500 -->
		<section class="theme-route-missing">
			<h1>{typeof data.content?.title === 'string' ? data.content.title : data.themeRoute.path}</h1>
			<p>
				此主題尚未提供 <code>{data.themeRoute.surface}</code> 頁面元件（表面缺失＝主題問題，非你的內容問題）。
			</p>
		</section>
	{/if}
{:else if data.genericList}
	{#if pack.ItemList}
		<svelte:component this={pack.ItemList} {...data.genericList} />
	{:else}
		<GenericItemList {...data.genericList} />
	{/if}
{:else}
	<Page page={data.page} />
{/if}
