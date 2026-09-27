<script lang="ts">
	/**
	 * Newsroom header: three-band masthead — utility strip (date + tools),
	 * centered serif nameplate with rules, section bar (nav + topics + search).
	 * Mainstream new-site anatomy; full shared contract preserved.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import { getLocale } from '$lib/paraglide/runtime';
	import { openSearch } from '$lib/stores/search.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';
	import { themeNav } from '$lib/themes/routes';

	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived(page.data.navPages ?? []);
	const navOverride = $derived(themeNav(page.data.settings?.themeContent));
	const onBlog = $derived(page.url.pathname.startsWith('/blog'));
	const today = $derived(
		new Date().toLocaleDateString(getLocale(), {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			weekday: 'long'
		})
	);
</script>

<header class="n-header" data-header>
	<div class="n-utility">
		<span class="date">{today}</span>
		<span class="n-tools">
			<ThemeToggle />
			<LocaleSwitcher />
		</span>
	</div>

	<div class="n-mast">
		<a class="nameplate" href={href('/')}>{site.title}</a>
	</div>

	<nav class="n-sections" aria-label={m.nav_menu()}>
		{#if navOverride}
			{#each navOverride as item (item.href)}
				<a href={item.href}>{item.label}</a>
			{/each}
		{:else}
			<a href={href('/')}>{m.nav_home()}</a>
			<a href={href('/blog')} class:on={onBlog}>{m.nav_blog()}</a>
			<a href={href('/about')}>{m.nav_about()}</a>
			{#each navPages as p (p.slug)}
				<a href={href(`/${p.slug}`)}>{p.title}</a>
			{/each}
		{/if}
		{#if navTags.length > 0 && !navOverride}
			<span class="n-topics-label">{m.nav_tags()}:</span>
			{#each navTags.slice(0, 6) as t (t.name)}
				<a class="topic" href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
			{/each}
		{/if}
		<button type="button" class="n-search" onclick={openSearch} aria-label={m.nav_search()}
			>⌕</button
		>
	</nav>
</header>

<style>
	.n-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--color-bg);
	}
	.n-utility {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 78rem;
		margin: 0 auto;
		padding: 0.35rem 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		color: var(--color-ink-muted);
		border-bottom: 1px solid var(--color-line);
	}
	.n-tools {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.n-mast {
		text-align: center;
		padding: 1.25rem 1rem 1rem;
	}
	.nameplate {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		font-weight: 700;
		letter-spacing: 0.01em;
		color: var(--color-ink);
		text-decoration: none;
	}
	.n-sections {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1.25rem;
		padding: 0.6rem 1.5rem;
		border-block: 1px solid var(--color-ink);
		border-bottom-width: 3px;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.n-sections a {
		color: var(--color-ink);
		text-decoration: none;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0;
	}
	.n-sections a:hover {
		color: var(--color-accent);
	}
	.n-sections a.on {
		color: var(--color-accent);
	}
	.n-topics-label {
		color: var(--color-ink-muted);
		font-size: 0.75rem;
		font-family: var(--font-mono);
	}
	.topic {
		color: var(--color-ink-muted) !important;
		font-weight: 400 !important;
		text-transform: none !important;
	}
	.topic:hover {
		color: var(--color-accent) !important;
	}
	.n-search {
		margin-left: 0.5rem;
		border: none;
		background: none;
		font-size: 1.0625rem;
		color: var(--color-ink);
		cursor: pointer;
		padding: 0 0.25rem;
	}
	.n-search:hover {
		color: var(--color-accent);
	}
	@media (max-width: 767px) {
		.n-mast {
			padding: 0.875rem 1rem 0.625rem;
		}
		.n-sections {
			gap: 0.875rem;
		}
		.n-topics-label,
		.topic {
			display: none;
		}
	}
</style>
