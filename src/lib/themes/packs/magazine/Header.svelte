<script lang="ts">
	/**
	 * Magazine header: journal masthead bar — serif wordmark left, issue date
	 * right on the hairline; second line = quiet nav with underline hover.
	 * Shared contract complete (navPages/navTags/search/toggle/locale).
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
	const issue = $derived(
		new Date().toLocaleDateString(getLocale(), { year: 'numeric', month: 'long' })
	);
	let topicsOpen = $state(false);
</script>

<header class="mg-header" data-header>
	<div class="rule">
		<a class="word" href={href('/')}>{site.title}</a>
		<span class="issue">{issue}</span>
	</div>
	<div class="bar">
		<nav aria-label={m.nav_menu()}>
			{#if navOverride}
				{#each navOverride as item (item.href)}
					<a href={item.href}>{item.label}</a>
				{/each}
			{:else}
				<a href={href('/blog')} class:on={onBlog}>{m.nav_blog()}</a>
				<a href={href('/about')}>{m.nav_about()}</a>
				{#each navPages as p (p.slug)}
					<a href={href(`/${p.slug}`)}>{p.title}</a>
				{/each}
			{/if}
			{#if navTags.length}
				<button
					type="button"
					class="dd"
					aria-expanded={topicsOpen}
					onclick={() => (topicsOpen = !topicsOpen)}>{m.nav_tags()}</button
				>
				{#if topicsOpen}
					<span class="ddmenu">
						{#each navTags.slice(0, 10) as t (t.name)}
							<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
						{/each}
					</span>
				{/if}
			{/if}
		</nav>
		<span class="tools">
			<button type="button" class="s" onclick={openSearch} aria-label={m.nav_search()}>⌕</button>
			<ThemeToggle />
			<LocaleSwitcher />
		</span>
	</div>
</header>

<style>
	.mg-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--color-bg) 94%, transparent);
		backdrop-filter: blur(8px);
	}
	.rule {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.25rem 1.5rem 0.75rem;
		border-bottom: 1px solid var(--color-ink);
	}
	.word {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.625rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--color-ink);
		text-decoration: none;
	}
	.issue {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 72rem;
		margin: 0 auto;
		padding: 0.5rem 1.5rem 0.625rem;
	}
	nav {
		display: flex;
		align-items: center;
		gap: 1.375rem;
		position: relative;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}
	nav a,
	.dd {
		background: none;
		border: none;
		font: inherit;
		color: var(--color-ink-muted);
		text-decoration: none;
		cursor: pointer;
		padding-bottom: 0.1rem;
		border-bottom: 1px solid transparent;
	}
	nav a:hover,
	.dd:hover {
		color: var(--color-ink);
		border-bottom-color: var(--color-ink);
	}
	nav a.on {
		color: var(--color-ink);
		border-bottom-color: var(--color-accent);
	}
	.ddmenu {
		position: absolute;
		top: 100%;
		right: 0;
		display: grid;
		min-width: 10rem;
		padding: 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
		z-index: 60;
	}
	.ddmenu a {
		padding: 0.35rem 0.55rem;
		border-radius: 0.35rem;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.8125rem;
	}
	.ddmenu a:hover {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.s {
		border: none;
		background: none;
		font-size: 1rem;
		color: var(--color-ink-muted);
		cursor: pointer;
		padding: 0 0.375rem;
	}
	.s:hover {
		color: var(--color-ink);
	}
</style>
