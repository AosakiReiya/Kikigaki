import Header from './Header.svelte';
import Footer from './Footer.svelte';
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

/** Newsroom pack (78e/78f): newspaper anatomy across all surfaces.
 *  theme_content contract: nav (themeNav), mastNote + newsdesk (About). */
export const newsPack: ThemePack = {
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
