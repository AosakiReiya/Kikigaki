<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import { openSearch } from '$lib/stores/search.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';

	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived(page.data.navPages ?? []);
	const onHome = $derived(page.url.pathname === '/');
</script>

<header class="t-header" data-header>
	<div class="t-bar">
		<span class="t-prompt">visitor@{site.title.toLowerCase()}:~$</span>
		<nav class="t-cmd" aria-label="main">
			<a href={href('/')} class:t-on={onHome}>./home</a>
			<a href={href('/about')}>./about</a>
			{#each navPages as p (p.slug)}
				<a href={href(`/${p.slug}`)}>./{p.slug}</a>
			{/each}
			{#if navTags.length > 0}
				<span class="t-fold">
					tags:
					{#each navTags.slice(0, 6) as tag (tag.name)}
						<a href={href(`/tags/${encodeURIComponent(tag.name)}`)}>#{tag.display}</a>
					{/each}
				</span>
			{/if}
		</nav>
		<span class="t-tools">
			<button type="button" class="t-btn" onclick={openSearch} aria-label={m.nav_search()}>⌕</button
			>
			<ThemeToggle />
			<LocaleSwitcher />
		</span>
	</div>
</header>

<style>
	.t-header {
		position: sticky;
		top: 0;
		z-index: 50;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-line);
	}

	.t-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		max-width: 72rem;
		margin: 0 auto;
		padding: 0.75rem 1.25rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.t-prompt {
		color: var(--color-strong);
		white-space: nowrap;
	}

	.t-cmd {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.t-cmd a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-cmd a:hover {
		color: var(--color-strong);
	}

	.t-on {
		border-bottom: 1px solid var(--color-accent);
	}

	.t-fold {
		color: var(--color-ink-muted);
		display: inline-flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.t-fold a {
		color: var(--color-ink-muted);
	}

	.t-fold a:hover {
		color: var(--color-strong);
	}

	.t-tools {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-left: auto;
	}

	.t-btn {
		border: none;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 0.375rem;
		line-height: 1;
	}

	.t-btn:hover {
		color: var(--color-strong);
	}
</style>
