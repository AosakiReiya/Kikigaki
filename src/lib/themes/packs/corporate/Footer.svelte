<script lang="ts">
	/**
	 * Corporate footer: enterprise columns — company (identity + footer note),
	 * navigation, capabilities (topic index), and a contact block (desk email /
	 * phone from theme_content + social icons). No blog tag-cloud residue.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';

	const navTags = $derived(page.data.navTags ?? []);
	const navPages = $derived(page.data.navPages ?? []);
	const year = new Date().getFullYear();
	const tc = $derived(page.data.settings?.themeContent ?? {});
	const desk = $derived((tc.contact ?? {}) as { email?: string; phone?: string });
</script>

<footer class="c-footer">
	<div class="cols">
		<div class="col brandcol">
			<p class="brand"><span class="mark" aria-hidden="true"></span>{site.title}</p>
			<p class="blurb">{site.footerText || tc.hero?.eyebrow || m.site_tagline()}</p>
		</div>
		<nav class="col" aria-label={m.nav_menu()}>
			<h3>Company</h3>
			<a href={href('/')}>{m.nav_home()}</a>
			<a href={href('/about')}>{m.nav_about()}</a>
			<a href={href('/blog')}>{m.nav_blog()}</a>
			{#each navPages.slice(0, 4) as p (p.slug)}
				<a href={href(`/${p.slug}`)}>{p.title}</a>
			{/each}
		</nav>
		{#if navTags.length}
			<nav class="col" aria-label={m.nav_tags()}>
				<h3>Topics</h3>
				{#each navTags.slice(0, 6) as t (t.name)}
					<a href={href(`/tags/${encodeURIComponent(t.name)}`)}>{t.display}</a>
				{/each}
			</nav>
		{/if}
		<div class="col">
			<h3>Get in touch</h3>
			{#if desk.email}<a class="em" href={`mailto:${desk.email}`}>{desk.email}</a>{/if}
			{#if desk.phone}<span class="ph">{desk.phone}</span>{/if}
			<a href={href('/contact')}
				>{typeof tc.contactCta === 'string' ? tc.contactCta : 'All contact options'} →</a
			>
			<div class="socials">
				{#each site.socials as link (link.id)}
					{#if hasIcon(link.id) && link.url}
						<a href={link.url} rel="me noopener" target="_blank" title={link.id}>
							<SocialIcon name={link.icon} />
						</a>
					{/if}
				{/each}
			</div>
		</div>
	</div>
	<div class="fine">
		<span>{site.copyright || `© ${year} ${site.title}`}</span>
	</div>
</footer>

<style>
	.c-footer {
		margin-top: 5rem;
		border-top: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
	}
	.cols {
		display: grid;
		grid-template-columns: 1.6fr repeat(3, 1fr);
		gap: 2rem;
		max-width: 72rem;
		margin: 0 auto;
		padding: 3.25rem 1.5rem 2rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1.0625rem;
		letter-spacing: -0.01em;
		margin: 0 0 0.875rem;
	}
	.mark {
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 0.25rem;
		background: var(--color-accent);
	}
	.blurb {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.75;
		color: var(--color-ink-muted);
		max-width: 24ch;
	}
	h3 {
		margin: 0 0 0.875rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.col a {
		display: block;
		padding: 0.25rem 0;
		font-size: 0.875rem;
		color: var(--color-ink);
		text-decoration: none;
	}
	.col a:hover {
		color: var(--color-accent);
	}
	.col .em {
		font-weight: 650;
	}
	.ph {
		display: block;
		padding: 0.25rem 0;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}
	.socials {
		display: flex;
		gap: 0.625rem;
		margin-top: 1rem;
	}
	.socials a {
		display: inline-flex;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		color: var(--color-ink-muted);
	}
	.socials a:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
	.fine {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.125rem 1.5rem 1.75rem;
		border-top: 1px solid var(--color-line);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
	@media (max-width: 767px) {
		.cols {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
