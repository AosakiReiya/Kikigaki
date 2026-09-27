import Header from './Header.svelte';
import Footer from './Footer.svelte';
import Home from './Home.svelte';
import Blog from './Blog.svelte';
import Search from './Search.svelte';
import Post from './Post.svelte';
import Archive from './Archive.svelte';
import Page from './Page.svelte';
import { About } from '../abstract';
import SeriesIndex from './SeriesIndex.svelte';
import Series from './Series.svelte';
import type { ThemePack } from '../../contracts';

/** Terminal = structural reskin: command-line header / ls home / man-page posts (tokens in themes.css).
 *  The About (Portfolio) skeleton is shared with abstract; colors follow the terminal tokens automatically. */
export const terminalPack: ThemePack = {
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
