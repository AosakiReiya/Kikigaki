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
import type { ThemePack } from '../../contracts';

/** Abstract = the current design (baseline pack): the existing Header/Footer adopted as-is */
export const abstractPack: ThemePack = {
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
	Series
};
export { About };
