<script lang="ts">
	import { page } from '$app/state';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import type { Snippet } from 'svelte';
	import { agent } from '$lib/agent/client/agent-store.svelte';
	import FloatingAgent from '$lib/components/agent/FloatingAgent.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children }: { children: Snippet } = $props();

	const nav = [
		{ path: '/admin', label: '總覽' },
		{ path: '/admin/analytics', label: 'Analytics' },
		{ path: '/admin/posts', label: '文章' },
		{ path: '/admin/pages', label: '頁面' },
		{ path: '/admin/tags', label: '標籤' },
		{ path: '/admin/categories', label: '分類' },
		{ path: '/admin/series', label: '系列' },
		{ path: '/admin/media', label: '媒體' },
		{ path: '/admin/comments', label: '評論' },
		{ path: '/admin/email-templates', label: 'Email' },
		{ path: '/admin/components', label: '元件 Workshop' },
		{ path: '/admin/registry', label: 'Registry' },
		{ path: '/admin/agent', label: '✦ AI Agent' },
		{ path: '/admin/agents', label: 'Agents' },
		{ path: '/admin/sandbox', label: 'Sandbox PoC' },
		{ path: '/admin/themes', label: '主題工作台' },
		{ path: '/admin/content', label: '內容型別' },
		{ path: '/admin/orders', label: '訂單' },
		{ path: '/admin/settings', label: '設定' }
	];

	// environment context: any admin page switch syncs automatically (route)
	$effect(() => {
		agent.setContext({ route: page.url.pathname });
	});

	const isActive = (path: string) =>
		path === '/admin'
			? page.url.pathname === '/admin'
			: page.url.pathname === path || page.url.pathname.startsWith(path + '/');
</script>

<svelte:head>
	<title>Admin — {site.title}</title>
</svelte:head>

<div class="panel">
	<aside class="sidebar">
		<a class="brand" href={href('/')}>{site.title}</a>
		<nav>
			{#each nav as item (item.path)}
				<a href={item.path} class:active={isActive(item.path)}>{item.label}</a>
			{/each}
		</nav>
		<div class="foot">
			<ThemeToggle />
			<form method="POST" action="/admin/logout" class="logout">
				<button type="submit">登出</button>
			</form>
		</div>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>

<FloatingAgent />

<style>
	.panel {
		display: grid;
		grid-template-columns: 14rem 1fr;
		height: 100dvh;
		overflow: hidden;
	}

	.sidebar {
		position: sticky;
		top: 0;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		padding: 2rem 1.25rem;
		border-right: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
	}

	.brand {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--color-ink);
		text-decoration: none;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	nav {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	nav a {
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.9375rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition:
			color 0.2s ease,
			background-color 0.2s ease;
	}

	nav a:hover {
		color: var(--color-ink);
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
	}

	nav a.active {
		color: var(--color-ink);
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}

	.foot {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.logout button {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.875rem;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.logout button:hover {
		color: var(--color-ink);
	}

	.content {
		padding: 2.5rem 2rem;
		min-width: 0;
		min-height: 0;
		height: 100dvh;
		overflow-y: auto;
	}

	@media (max-width: 767px) {
		.panel {
			grid-template-columns: 1fr;
			height: auto;
			overflow: visible;
		}

		.content {
			height: auto;
			overflow: visible;
		}

		.sidebar {
			position: static;
			height: auto;
			flex-direction: row;
			align-items: center;
			gap: 1rem;
			border-right: none;
			border-bottom: 1px solid var(--color-line);
			padding: 0.875rem 1rem;
		}

		nav {
			flex-direction: row;
			overflow: visible;
		}

		.foot {
			margin-top: 0;
			margin-left: auto;
		}
	}

	/* 58.7 unified form-control vocabulary (native select aligned with inputs/Combobox) */
	:global(select) {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
	}

	:global(select:focus) {
		outline: none;
		border-color: var(--color-accent);
	}
</style>
