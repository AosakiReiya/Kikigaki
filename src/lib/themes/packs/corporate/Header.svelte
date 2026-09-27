<script lang="ts">
	/**
	 * Corporate header: enterprise top-bar — brand mark left, primary nav, utility
	 * tools right (search / dark-light / locale) plus an accent CTA. Condenses and
	 * gains a hairline shadow on scroll. Keeps every shared-header contract:
	 * navPages + topics dropdown + search trigger + ThemeToggle + LocaleSwitcher.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import { openSearch } from '$lib/stores/search.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';
	import { themeNav } from '$lib/themes/routes';

	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived(page.data.navPages ?? []);
	// B2: non-empty theme_content.nav = the theme takes over navigation (owner-language customizable; empty = default composition)
	const navOverride = $derived(themeNav(page.data.settings?.themeContent));
	const tc = $derived(page.data.settings?.themeContent ?? {});
	const ctaLabel = $derived(typeof tc.ctaLabel === 'string' ? tc.ctaLabel : 'Get in touch');
	const ctaHref = $derived(typeof tc.ctaHref === 'string' ? tc.ctaHref : '/contact');
	const onHome = $derived(page.url.pathname === '/');
	const onBlog = $derived(page.url.pathname.startsWith('/blog'));
	let topicsOpen = $state(false);
	let scrolled = $state(false);

	$effect(() => {
		const fn = () => (scrolled = window.scrollY > 8);
		fn();
		window.addEventListener('scroll', fn, { passive: true });
		const close = (e: MouseEvent) => {
			const t = e.target as HTMLElement;
			if (!t.closest('[data-topics]')) topicsOpen = false;
		};
		document.addEventListener('click', close);
		return () => {
			window.removeEventListener('scroll', fn);
			document.removeEventListener('click', close);
		};
	});
</script>

<header class="c-header" class:scrolled data-header>
	<div class="c-bar">
		<a class="brand" href={href('/')}>
			<span class="mark" aria-hidden="true"></span>
			<span>{site.title}</span>
		</a>

		<nav class="c-nav" aria-label={m.nav_menu()}>
			{#if navOverride}
				{#each navOverride as item (item.href)}
					<a href={item.href}>{item.label}</a>
				{/each}
			{:else}
				<a href={href('/')} class:on={onHome}>{m.nav_home()}</a>
				<a href={href('/blog')} class:on={onBlog}>{m.nav_blog()}</a>
				{#each navPages as p (p.slug)}
					<a href={href(`/${p.slug}`)}>{p.title}</a>
				{/each}
			{/if}
			{#if navTags.length > 0 && !navOverride}
				<span class="c-topics" data-topics>
					<button
						type="button"
						class="drop"
						aria-expanded={topicsOpen}
						onclick={() => (topicsOpen = !topicsOpen)}
					>
						{m.nav_tags()} ▾
					</button>
					{#if topicsOpen}
						<span class="menu">
							{#each navTags.slice(0, 12) as tag (tag.name)}
								<a href={href(`/tags/${encodeURIComponent(tag.name)}`)}>{tag.display}</a>
							{/each}
						</span>
					{/if}
				</span>
			{/if}
		</nav>

		<span class="c-tools">
			<button type="button" class="c-btn" onclick={openSearch} aria-label={m.nav_search()}>⌕</button
			>
			<ThemeToggle />
			<LocaleSwitcher />
			<a class="c-cta" href={href(ctaHref)}>{ctaLabel}</a>
		</span>
	</div>
</header>

<style>
	.c-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--color-bg-elevated) 92%, transparent);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid transparent;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.c-header.scrolled {
		border-bottom-color: var(--color-line);
		box-shadow: 0 4px 18px rgb(0 0 0 / 6%);
	}
	.c-bar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		max-width: 76rem;
		margin: 0 auto;
		padding: 1rem 1.5rem;
		transition: padding 0.2s ease;
		font-size: 0.875rem;
	}
	.scrolled .c-bar {
		padding-block: 0.625rem;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1.0625rem;
		letter-spacing: -0.01em;
		color: var(--color-ink);
		text-decoration: none;
		white-space: nowrap;
	}
	.mark {
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 0.25rem;
		background: var(--color-accent);
		flex: none;
	}
	.c-nav {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}
	.c-nav a,
	.drop {
		color: var(--color-ink-muted);
		text-decoration: none;
		background: none;
		border: none;
		font: inherit;
		padding: 0.25rem 0;
		cursor: pointer;
		transition: color 0.15s ease;
	}
	.c-nav a:hover,
	.drop:hover {
		color: var(--color-ink);
	}
	.c-nav a.on {
		color: var(--color-ink);
		font-weight: 600;
		box-shadow: inset 0 -2px 0 var(--color-accent);
	}
	.c-topics {
		position: relative;
		display: inline-flex;
	}
	.menu {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		display: grid;
		min-width: 11rem;
		padding: 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
		z-index: 60;
	}
	.menu a {
		padding: 0.4rem 0.6rem;
		border-radius: 0.4rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.menu a:hover {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
		color: var(--color-ink);
	}
	.c-tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}
	.c-btn {
		border: none;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 0.375rem;
		line-height: 1;
	}
	.c-btn:hover {
		color: var(--color-accent);
	}
	.c-cta {
		padding: 0.4375rem 1rem;
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-size: 0.8125rem;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
	}
	@media (max-width: 767px) {
		.c-bar {
			gap: 1rem;
			padding: 0.75rem 1.25rem;
		}
		.c-nav {
			order: 3;
			width: 100%;
			gap: 1rem;
		}
		.c-cta {
			display: none;
		}
	}
</style>
