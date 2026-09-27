<script lang="ts">
	/**
	 * Corporate Contact page (78f B2, theme context route /contact).
	 * theme_content.contact: { email, phone, address, hours, note };
	 * socials come from site settings; form-less by design (transactional email
	 * is provider-gated) — mailto + channels keeps the promise honest.
	 */
	import { site } from '$lib/site';
	import * as m from '$lib/paraglide/messages';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';
	import type { ThemeRouteProps } from '../../contracts';

	let { content, themeContent }: ThemeRouteProps = $props();

	const c = $derived(
		(themeContent.contact ?? {}) as {
			email?: string;
			phone?: string;
			address?: string;
			hours?: string;
			note?: string;
		}
	);
	const title = $derived(typeof content?.title === 'string' ? content.title : '聯絡我們');
</script>

<svelte:head>
	<title>{title} — {site.title}</title>
</svelte:head>

<section class="cpg">
	<header class="cpg-hero">
		<h1>{title}</h1>
		{#if c.note}<p class="lede">{c.note}</p>{/if}
	</header>

	<div class="cols">
		<div class="channels">
			{#if c.email}
				<a class="ch" href={`mailto:${c.email}`}>
					<span class="k">Email</span><span class="v">{c.email}</span>
				</a>
			{/if}
			{#if c.phone}
				<a class="ch" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>
					<span class="k">Phone</span><span class="v">{c.phone}</span>
				</a>
			{/if}
			{#if c.address}
				<div class="ch static">
					<span class="k">Address</span><span class="v">{c.address}</span>
				</div>
			{/if}
			{#if c.hours}
				<div class="ch static">
					<span class="k">Hours</span><span class="v">{c.hours}</span>
				</div>
			{/if}
			{#if !c.email && !c.phone && !c.address && !c.hours}
				<p class="hint-empty">
					在「主題內容」填 <code>contact.email / phone / address / hours / note</code> 即顯示於此。
				</p>
			{/if}
		</div>

		<div class="side">
			<h2>{m.about_cta_title()}</h2>
			<div class="socials">
				{#each site.socials as link (link.id)}
					{#if hasIcon(link.id) && link.url}
						<a href={link.url} rel="me noopener" target="_blank" title={link.id}>
							<SocialIcon name={link.icon} />
							<span>{link.id}</span>
						</a>
					{/if}
				{/each}
			</div>
			<p class="about-link"><a href="/about">{m.nav_about()} →</a></p>
		</div>
	</div>
</section>

<style>
	.cpg {
		max-width: 62rem;
		margin: 0 auto;
		padding: 3.5rem 1.5rem 2rem;
	}
	.cpg-hero {
		margin-bottom: 2.5rem;
	}
	h1 {
		font-size: clamp(1.875rem, 4vw, 2.5rem);
		font-weight: 700;
		margin: 0 0 0.625rem;
	}
	.lede {
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 1.0625rem;
	}
	.cols {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 2.5rem;
		align-items: start;
	}
	.channels {
		display: grid;
		gap: 0.875rem;
	}
	.ch {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		gap: 1rem;
		align-items: baseline;
		padding: 1.125rem 1.375rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated);
		text-decoration: none;
		color: var(--color-ink);
		transition: border-color 0.15s ease;
	}
	.ch:hover {
		border-color: var(--color-accent);
	}
	.k {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.v {
		font-size: 0.9375rem;
		font-weight: 600;
		word-break: break-all;
	}
	.ch.static {
		cursor: default;
	}
	.hint-empty {
		padding: 2rem 1.5rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.875rem;
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}
	h2 {
		margin: 0 0 1rem;
		font-size: 0.75rem;
		font-family: var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.socials {
		display: grid;
		gap: 0.625rem;
	}
	.socials a {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		color: var(--color-ink);
		text-decoration: none;
		font-size: 0.875rem;
	}
	.socials a:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.about-link {
		margin: 1.25rem 0 0;
		font-size: 0.875rem;
	}
	.about-link a {
		color: var(--color-accent);
		text-decoration: none;
	}
	@media (max-width: 47.5rem) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
