<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { blogQuery } from '$lib/blog-params';
	import { menuDropdown } from '$lib/animation/menu';
	import { site } from '$lib/site';
	import { getHeaderVisible, setHeaderVisible } from '$lib/stores/header.svelte';
	import { openSearch } from '$lib/stores/search.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';

	const builtinLinks = [
		{ path: '/', label: m.nav_home() },
		{ path: '/blog', label: m.nav_blog() },
		{ path: '/series', label: m.nav_series() },
		{ path: '/about', label: m.nav_about() }
	];

	const headerVisible = $derived(getHeaderVisible());
	const settings = $derived(page.data.settings);
	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived<(typeof page.data.navPages)[number][]>(page.data.navPages ?? []);
	// built-in pages + custom pages (showInNav; the list is data, rendering authority belongs to the theme)
	const links = $derived([
		...builtinLinks,
		...navPages.map((p) => ({ path: `/${p.slug}`, label: p.title }))
	]);

	let tagsOpen = $state(false);
	let menuOpen = $state(false);

	$effect(() => {
		let lastY = window.scrollY;
		const onScroll = () => {
			const y = window.scrollY;
			if (y > lastY && y > 160) {
				setHeaderVisible(false);
			} else if (y < lastY) {
				setHeaderVisible(true);
			}
			lastY = y;
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	// dropdowns/drawers: close on Esc or outside click
	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				tagsOpen = false;
				menuOpen = false;
			}
		};
		const onDown = (e: MouseEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && !t.closest('[data-tags-menu]')) tagsOpen = false;
			if (t && !t.closest('[data-drawer]') && !t.closest('[data-menu-btn]')) menuOpen = false;
		};
		document.addEventListener('keydown', onKey);
		document.addEventListener('mousedown', onDown);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('mousedown', onDown);
		};
	});

	$effect(() => {
		if (menuOpen || tagsOpen) {
			document.body.style.overflow = menuOpen ? 'hidden' : '';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<header class="site-header" class:header-hidden={!headerVisible} data-header>
	<div class="header-inner">
		<a href={href('/')} class="brand" data-flip-id="brand">
			{#if settings?.logo}
				<img class="brand-logo" src={settings.logo} alt={site.title} width="36" height="36" />
			{:else}
				{site.title}
			{/if}
		</a>

		<nav aria-label="main" class="nav">
			{#each links as link (link.path)}
				<a
					href={href(link.path)}
					class="nav-link"
					aria-current={page.url.pathname === link.path ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}

			{#if navTags.length > 0}
				<div class="tags-menu" data-tags-menu use:menuDropdown={{ open: tagsOpen, xPercent: -50 }}>
					<button
						type="button"
						class="nav-link tags-btn"
						aria-expanded={tagsOpen}
						onclick={() => (tagsOpen = !tagsOpen)}
					>
						{m.nav_tags()}<span class="caret" aria-hidden="true" data-menu-caret>▾</span>
					</button>
					<div class="tags-panel" role="menu" inert={tagsOpen ? undefined : true} data-menu-panel>
						{#each navTags as tag (tag.name)}
							<a
								class="tag-item"
								data-menu-item
								href={href('/blog' + blogQuery({ tag: tag.name }))}
								onclick={() => (tagsOpen = false)}
							>
								<span>#{tag.display}</span>
								<span class="count">{tag.count}</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<div class="nav-icons">
				<button
					type="button"
					class="nav-link icon-btn"
					onclick={() => openSearch()}
					aria-label={m.nav_search()}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.9"
						stroke-linecap="round"
						aria-hidden="true"
					>
						<circle cx="10.8" cy="10.8" r="7"></circle>
						<path d="m16.2 16.2 4.6 4.6"></path>
					</svg>
				</button>

				<ThemeToggle />
				<LocaleSwitcher />
			</div>

			<button
				type="button"
				class="menu-btn"
				class:open={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
				aria-label={m.nav_menu()}
				aria-expanded={menuOpen}
				data-menu-btn
			>
				<span class="menu-line"></span>
				<span class="menu-line"></span>
			</button>
		</nav>
	</div>
</header>

{#if menuOpen}
	<div class="drawer" data-drawer>
		<nav class="drawer-nav" aria-label="mobile">
			{#each links as link (link.path)}
				<a
					href={href(link.path)}
					class="drawer-link"
					aria-current={page.url.pathname === link.path ? 'page' : undefined}
					onclick={() => (menuOpen = false)}
				>
					{link.label}
				</a>
			{/each}
			<button
				type="button"
				class="drawer-link"
				onclick={() => {
					menuOpen = false;
					openSearch();
				}}
			>
				⌕ {m.nav_search()}
			</button>
			<LocaleSwitcher variant="list" />
			{#if navTags.length > 0}
				<div class="drawer-tags">
					<p class="drawer-label">{m.nav_tags()}</p>
					<div class="drawer-tag-list">
						{#each navTags as tag (tag.name)}
							<a
								class="drawer-tag"
								href={href('/blog' + blogQuery({ tag: tag.name }))}
								onclick={() => (menuOpen = false)}
							>
								#{tag.display}<span class="count">{tag.count}</span>
							</a>
						{/each}
					</div>
				</div>
			{/if}
		</nav>
	</div>
{/if}

<style>
	.site-header {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background-color: color-mix(in srgb, var(--color-bg) 82%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--color-line);
		transition:
			transform 0.35s ease,
			border-color 0.35s ease,
			background-color 0.35s ease;
	}

	.site-header.header-hidden {
		transform: translateY(-100%);
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 80rem;
		margin: 0 auto;
		padding: 0.875rem 1.5rem;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.125rem;
		letter-spacing: -0.02em;
		color: var(--color-ink);
		text-decoration: none;
	}

	.brand-logo {
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		object-fit: cover;
		border: 1px solid var(--color-line);
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 1.75rem;
	}

	/* icon button group: compact among themselves, keeps the nav gap from text links */
	.nav-icons {
		display: flex;
		align-items: center;
		gap: 0.125rem;
	}

	.nav-link {
		position: relative;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
	}

	.nav-link:hover {
		color: var(--color-ink);
	}

	.nav-link[aria-current='page'] {
		color: var(--color-ink);
	}

	.nav-link[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -0.375rem;
		height: 2px;
		background-color: var(--color-accent);
	}

	.tags-menu {
		position: relative;
	}

	.tags-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.caret {
		display: inline-block;
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.tags-panel {
		position: absolute;
		top: calc(100% + 0.75rem);
		left: 50%;
		transform: translateX(-50%);
		width: 15rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.35);
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		max-height: 24rem;
		overflow-y: auto;
		/* initially collapsed: GSAP autoAlpha takes over ({#if} swapped for a resident node to support collapse animation) */
		visibility: hidden;
		opacity: 0;
	}

	.tag-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		color: var(--color-ink);
		text-decoration: none;
		font-size: 0.875rem;
	}

	.tag-item:hover {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		font-size: 1.125rem;
		line-height: 1;
		color: var(--color-ink-muted);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.icon-btn:hover {
		color: var(--color-ink);
	}

	.menu-btn {
		display: none;
		appearance: none;
		background: none;
		border: none;
		padding: 0.375rem;
		cursor: pointer;
		flex-direction: column;
		gap: 5px;
	}

	.menu-line {
		display: block;
		width: 1.25rem;
		height: 2px;
		background: var(--color-ink);
		border-radius: 2px;
		transition:
			transform 0.25s ease,
			opacity 0.25s ease;
	}

	.menu-btn.open .menu-line:first-child {
		transform: translateY(3.5px) rotate(45deg);
	}

	.menu-btn.open .menu-line:last-child {
		transform: translateY(-3.5px) rotate(-45deg);
	}

	.drawer {
		position: fixed;
		top: 3.5rem;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 55;
		background: var(--color-bg-elevated);
		border-top: 1px solid var(--color-line);
		overflow-y: auto;
		padding: 1.5rem;
		animation: drawer-in 0.25s ease;
	}

	@keyframes drawer-in {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.drawer-nav {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.drawer-link {
		font-size: 1.125rem;
		font-weight: 500;
		color: var(--color-ink);
		text-decoration: none;
		padding: 0.625rem 0;
		background: none;
		border: none;
		text-align: left;
		font-family: inherit;
		cursor: pointer;
		border-bottom: 1px solid var(--color-line);
	}

	.drawer-link[aria-current='page'] {
		color: var(--color-strong);
	}

	.drawer-tags {
		margin-top: 0.5rem;
	}

	.drawer-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin: 0 0 0.75rem;
	}

	.drawer-tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.drawer-tag {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		color: var(--color-ink-muted);
		text-decoration: none;
		font-size: 0.8125rem;
	}

	.drawer-tag:hover {
		border-color: var(--color-strong);
		color: var(--color-ink);
	}

	.drawer-tag .count {
		margin-left: 0.25rem;
	}

	@media (max-width: 767px) {
		.header-inner {
			padding: 0.75rem 1rem;
		}

		.nav {
			gap: 1.25rem;
		}

		.nav > :global(.nav-link:not(.icon-btn):not(.tags-btn)),
		.tags-menu {
			display: none;
		}

		.menu-btn {
			display: flex;
		}
	}
</style>
