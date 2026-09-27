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
import Services from './Services.svelte';
import Contact from './Contact.svelte';
import type { ThemePack } from '../../contracts';

/** Corporate (78e T1): corporate-site identity pack — own Header/Footer/Home/Blog/Post */
export const corporatePack: ThemePack = {
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
	// 78f B2: context-route pages (/services /contact); content lives in theme_content
	extra: { Services, Contact },
	routes: [
		{ path: 'services', surface: 'Services' },
		{ path: 'contact', surface: 'Contact' }
	]
};
export { About };
