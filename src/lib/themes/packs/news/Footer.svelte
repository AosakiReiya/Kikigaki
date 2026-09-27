<script lang="ts">
	/**
	 * Newsroom footer: newspaper colophon — nameplate, section links row,
	 * topics row, fine print with socials on one baseline. Dense and ruled.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';

	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived(page.data.navPages ?? []);
	const year = new Date().getFullYear();
</script>

<footer class="n-footer">
	<div class="line1">
		<span class="np">{site.title}</span>
		<nav aria-label={m.nav_menu()}>
			<a href={href('/')}>{m.nav_home()}</a>
			<a href={href('/blog')}>{m.nav_blog()}</a>
			<a href={href('/about')}>{m.nav_about()}</a>
			{#each navPages as p (p.slug)}
				<a href={href(`/${p.slug}`)}>{p.title}</a>
			{/each}
		</nav>
		<span class="socials">
			{#each site.socials as link (link.id)}
				{#if hasIcon(link.id) && link.url}
					<a href={link.url} rel="me noopener" target="_blank" title={link.id}>
						<SocialIcon name={link.icon} />
					</a>
				{/if}
			{/each}
		</span>
	</div>
	{#if navTags.length}
		<div class="line2">
			{#each navTags.slice(0, 12) as t (t.name)}
				<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
			{/each}
		</div>
	{/if}
	<div class="fine">
		<span>{site.copyright || `© ${year} ${site.title}`}</span>
		{#if site.footerText}<span class="note">{site.footerText}</span>{/if}
	</div>
</footer>

<style>
	.n-footer {
		margin-top: 4rem;
		border-top: 3px solid var(--color-ink);
		padding-top: 0;
	}
	.line1 {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
		max-width: 78rem;
		margin: 0 auto;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-line);
	}
	.np {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-weight: 700;
		font-size: 1.25rem;
	}
	.line1 nav {
		display: flex;
		gap: 1.125rem;
		flex-wrap: wrap;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.line1 a {
		color: var(--color-ink);
		text-decoration: none;
	}
	.line1 nav a:hover,
	.line2 a:hover {
		color: var(--color-accent);
	}
	.socials {
		display: flex;
		gap: 0.625rem;
		margin-left: auto;
	}
	.socials a {
		color: var(--color-ink-muted);
		display: inline-flex;
	}
	.socials a:hover {
		color: var(--color-accent);
	}
	.line2 {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		max-width: 78rem;
		margin: 0 auto;
		padding: 0.625rem 1.5rem;
		border-bottom: 1px solid var(--color-line);
		font-size: 0.75rem;
	}
	.line2 a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}
	.fine {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		max-width: 78rem;
		margin: 0 auto;
		padding: 0.875rem 1.5rem 1.25rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}
</style>
