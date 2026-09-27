<script lang="ts">
	/** Magazine footer: colophon — wordmark, one nav line, topic inline list, imprint fine print. */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';

	const navTags = $derived(page.data.navTags ?? []);
	const year = new Date().getFullYear();
</script>

<footer class="mg-footer">
	<div class="top">
		<span class="word">{site.title}</span>
		<nav aria-label={m.nav_menu()}>
			<a href={href('/')}>{m.nav_home()}</a>
			<a href={href('/blog')}>{m.nav_blog()}</a>
			<a href={href('/about')}>{m.nav_about()}</a>
		</nav>
		<span class="socials">
			{#each site.socials as link (link.id)}
				{#if hasIcon(link.id) && link.url}
					<a href={link.url} rel="me noopener" target="_blank" title={link.id}
						><SocialIcon name={link.icon} /></a
					>
				{/if}
			{/each}
		</span>
	</div>
	{#if navTags.length}
		<p class="topics">
			{#each navTags as t, i (t.name)}
				{#if i > 0}<span aria-hidden="true">·</span>{/if}
				<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
			{/each}
		</p>
	{/if}
	<p class="imprint">
		{site.copyright || `© ${year} ${site.title}`}
		{#if site.footerText}<span class="note">{site.footerText}</span>{/if}
	</p>
</footer>

<style>
	.mg-footer {
		margin-top: 4.5rem;
		border-top: 1px solid var(--color-ink);
		padding: 2.25rem 1.5rem 2rem;
		max-width: 72rem;
		margin-inline: auto;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 1.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.word {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.375rem;
		font-weight: 700;
	}
	.top nav,
	.top nav a {
		display: flex;
		gap: 1.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.top nav a:hover {
		color: var(--color-ink);
	}
	.socials {
		display: flex;
		gap: 0.625rem;
		margin-left: auto;
		color: var(--color-ink-muted);
	}
	.socials a:hover {
		color: var(--color-accent);
	}
	.top nav a:hover,
	.top nav a {
		color: var(--color-ink-muted);
	}
	.top nav a:hover {
		color: var(--color-ink);
	}
	.socials a {
		color: var(--color-ink-muted);
	}
	.topics {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1.25rem;
		font-size: 0.8125rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
	.topics a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.topics a:hover {
		color: var(--color-accent);
	}
	.imprint {
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--color-line);
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
</style>
