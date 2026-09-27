<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { AGENT_CONTENT_CHANNEL } from '$lib/agent/client/agent-store.svelte';
	import { getLocale, locales } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { HREFLANG, canonicalPath, localizedHref } from '$lib/i18n';
	import { analyticsBeacon } from '$lib/analytics';
	import { buildMeta } from '$lib/meta';
	import { applySiteRuntime, runtimeSiteDescription, site, siteRuntimeOf } from '$lib/site';
	import { initTheme } from '$lib/stores/theme.svelte';
	import { themeManifest } from '$lib/themes';
	import {
		swapSignal,
		isDbTheme,
		mountDbTheme,
		resolveManifest,
		resolvePack
	} from '$lib/themes/db-registry.svelte';
	import { applyResolvedBehavior } from '$lib/themes/behavior';
	import {
		getThemePreview,
		restoreThemePreview,
		setThemePreview
	} from '$lib/themes/preview.svelte';
	import { searchOpen, closeSearch } from '$lib/stores/search.svelte';
	import { initTransitions } from '$lib/animation/manager';
	import { initSmoothAnchors } from '$lib/animation/anchors';
	import { markReady } from '$lib/animation/ready';
	import SearchOverlay from '$lib/components/SearchOverlay.svelte';
	import TransitionOverlay from '$lib/animation/overlay.svelte';
	import Preloader from '$lib/animation/preloader.svelte';
	import './layout.css';

	let { children } = $props();

	initTheme();

	// Phase 65: site identity runtime overrides (SSR applies first via layout.server; this guards the hydrate first frame and hot updates)
	function applySiteFromData(): void {
		// 79-i18n: carry the current locale — per-locale site identity fields must also apply in the render layer (incl. hydrate first frame)
		applySiteRuntime(page.data.settings ? siteRuntimeOf(page.data.settings, getLocale()) : null);
	}
	applySiteFromData();
	$effect(() => {
		void page.data.settings;
		applySiteFromData();
	});

	// effective theme = structure preview (this admin tab) overriding the server-authoritative value; SSR is always the server value
	const serverTheme = $derived<string>(page.data.settings?.uiTheme ?? 'abstract');
	const activeTheme = $derived<string>(getThemePreview() ?? serverTheme);
	const pack = $derived(resolvePack(activeTheme));
	const Header = $derived(pack.Header);
	const Footer = $derived(pack.Footer);
	const theme = $derived(resolveManifest(activeTheme));
	const isPreviewing = $derived(activeTheme !== serverTheme);
	// admin brings its own sidebar nav: no public-site chrome rendered (Header/Footer/search/Preloader)
	const isAdmin = $derived(
		page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/')
	);

	// P2 swap feedback: fade the page body once when a DB theme's compiled surfaces land
	let swapFade = $state(false);
	$effect(() => {
		if (!swapSignal.tick) return;
		swapFade = true;
		const t = setTimeout(() => (swapFade = false), 700);
		return () => clearTimeout(t);
	});

	if (browser) restoreThemePreview();
	// 78c: db- themes mount as soon as compiled (resolvePack swaps reactively; SSR/first frame honestly falls back to the base layout)
	$effect(() => {
		if (isDbTheme(activeTheme)) void mountDbTheme(activeTheme);
	});

	$effect(() => {
		if (!browser) return;
		document.documentElement.setAttribute('data-ui-theme', activeTheme);
		applyResolvedBehavior(theme.behavior);
		if (!isPreviewing) {
			try {
				localStorage.setItem('kikigaki-ui-theme', serverTheme);
			} catch {
				// private-mode write failures ignored (pre-paint falls back to abstract; acceptable)
			}
		}
		// when the theme disables the Preloader (or admin paths don't mount it), pre-paint may have already added
		// preloading (mirror lag) → release content immediately; nobody mounts the Preloader at this point,
		// the ready gate must be released here (root cause of all theme staggers hanging after 79a)
		if (!theme.behavior.preloader || isAdmin) {
			document.documentElement.classList.remove('preloading');
			markReady();
		}
	});

	if (browser) {
		initTransitions(beforeNavigate, afterNavigate);
		initSmoothAnchors();
		// Agent content-change broadcast (Phase 28): an Agent edit in any tab → everything refetches live
		try {
			const ch = new BroadcastChannel(AGENT_CONTENT_CHANNEL);
			ch.onmessage = () => void invalidateAll();
		} catch {
			/* BroadcastChannel unsupported → same-tab invalidateAll still works */
		}
	}

	const basePath = $derived(canonicalPath(page.url.href));
	const currentLocale = $derived(getLocale());
	// pages may restrict hreflang scope (e.g. posts list only translated locales)
	const alternateLocales = $derived(page.data.hreflangLocales ?? locales);

	const meta = $derived(
		page.data.meta
			? buildMeta({
					...page.data.meta,
					url: site.url + localizedHref(page.data.meta.path, currentLocale),
					// empty description (e.g. home) = hand off to this site-level chain: site description → locale slogan → tagline
					description:
						page.data.meta.description ||
						runtimeSiteDescription() ||
						page.data.settings?.slogans?.[currentLocale] ||
						m.site_tagline(),
					twitterSite: page.data.settings?.twitterSite || undefined,
					image:
						(page.data.meta as { image?: string }).image ||
						page.data.settings?.defaultOgImage ||
						'/og-default.jpg'
				})
			: buildMeta({
					title: site.title,
					// home description chain (Phase 65.1): site description → current-locale slogan → dictionary tagline
					description:
						runtimeSiteDescription() ||
						page.data.settings?.slogans?.[currentLocale] ||
						m.site_tagline(),
					path: basePath,
					url: site.url + localizedHref(basePath, currentLocale),
					twitterSite: page.data.settings?.twitterSite || undefined,
					image: page.data.settings?.defaultOgImage || '/og-default.jpg'
				})
	);

	if (browser) {
		// view stats: recorded on first load AND SPA navigation (prerendered static pages never pass the server hook)
		// count by canonical (locale-prefix-free) path so /en/x and /x aren't split
		// admin is owner browsing — excluded from reader stats
		afterNavigate(() => {
			const path = canonicalPath(window.location.href);
			if (path.startsWith('/api/') || path.startsWith('/admin')) return;
			void fetch('/api/views', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(analyticsBeacon(path)),
				keepalive: true
			}).catch(() => {});
		});
	}
</script>

<svelte:head>
	{#if page.data.dbThemeTokens}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- intentional: server-sanitized (layout.server) tokens CSS with attribute -->
		{@html `<style data-db-theme-tokens="${page.data.dbThemeTokens.id}">${page.data.dbThemeTokens.css}</style>`}
	{/if}
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="icon" href="/favicon.png" type="image/png" sizes="64x64" />
	<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
	<title>{meta.title}</title>
	{#each meta.tags as tag, i (`${tag.name ?? tag.property}:${i}`)}
		{#if tag.name}
			<meta name={tag.name} content={tag.content} />
		{:else}
			<meta property={tag.property} content={tag.content} />
		{/if}
	{/each}
	<link rel="canonical" href={meta.canonical} />
	{#each alternateLocales as loc (loc)}
		<link rel="alternate" hreflang={HREFLANG[loc]} href={site.url + localizedHref(basePath, loc)} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={site.url + basePath} />
	<link rel="alternate" type="application/rss+xml" title={site.title} href="/rss.xml" />
	<link
		rel="alternate"
		type="application/rss+xml"
		title={site.title + ' — 系列'}
		href="/series.rss.xml"
	/>
</svelte:head>

{#if theme.behavior.preloader && !isAdmin}
	<Preloader />
{/if}
<TransitionOverlay />
{#if !isAdmin}
	<Header />
{/if}
<main
	id="page-content"
	class="page-main"
	class:bare={isAdmin}
	class:swap-fade={swapFade}
	data-transition-container
>
	{@render children()}
</main>
{#if !isAdmin}
	<Footer />
	<SearchOverlay open={searchOpen()} onClose={closeSearch} />
{/if}
{#if isPreviewing}
	<div class="preview-chip">
		⚡ 主題預覽中：{themeManifest(activeTheme).label}
		<button type="button" onclick={() => setThemePreview(null)}>結束預覽</button>
	</div>
{/if}

<style>
	.page-main {
		padding-top: 3.5rem;
		min-height: 70vh;
	}

	.page-main.bare {
		padding-top: 0;
		min-height: 0;
	}

	.preview-chip {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		translate: -50% 0;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--color-bg-elevated);
		border: 1px dashed var(--color-strong);
		border-radius: 999px;
		padding: 0.4rem 0.5rem 0.4rem 1rem;
		font-size: 0.8rem;
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.25);
	}

	.preview-chip button {
		border: 1px solid var(--color-line);
		border-radius: 999px;
		background: none;
		color: inherit;
		font-size: 0.72rem;
		padding: 0.15rem 0.6rem;
		cursor: pointer;
	}
</style>
