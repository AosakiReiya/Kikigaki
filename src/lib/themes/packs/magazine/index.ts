import Header from './Header.svelte';
import Footer from './Footer.svelte';
import Home from './Home.svelte';
import Blog from './Blog.svelte';
import Post from './Post.svelte';
import Search from '../abstract/Search.svelte';
import Archive from '../abstract/Archive.svelte';
import Page from '../abstract/Page.svelte';
import About from '../abstract/About.svelte';
import SeriesIndex from '../abstract/SeriesIndex.svelte';
import Series from '../abstract/Series.svelte';
import type { ThemePack } from '../../contracts';

/** Magazine (78e T3): print-editorial identity pack — own masthead/index/post typography; functional pages reuse the abstract implementation directly (zero copy drift) */
export const magazinePack: ThemePack = {
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
