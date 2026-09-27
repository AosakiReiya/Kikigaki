import Header from '$lib/components/Header.svelte';
import Footer from '$lib/components/Footer.svelte';
import Home from './Home.svelte';
import Blog from './Blog.svelte';
import Search from './Search.svelte';
import Post from './Post.svelte';
import Archive from './Archive.svelte';
import Page from './Page.svelte';
import About from './About.svelte';
import SeriesIndex from './SeriesIndex.svelte';
import Series from './Series.svelte';
import ItemList from './ItemList.svelte';
import ItemDetail from './ItemDetail.svelte';
import type { ThemePack } from '../../contracts';

/** Shop (79e): content surfaces reuse the abstract clone; the storefront language lives in the registry product surfaces. */
export const shopPack: ThemePack = {
	Header,
	Footer,
	Home,
	Blog,
	Search,
	Post,
	Archive,
	Page,
	About,
	SeriesIndex,
	Series,
	ItemList,
	ItemDetail
};
export { About };
