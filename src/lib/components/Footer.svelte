<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { site } from '$lib/site';
	import { page } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';

	const year = new Date().getFullYear();
</script>

<footer class="site-footer">
	<div class="footer-inner">
		<p class="brand" data-animate="footer-brand">{site.title}</p>
		<p class="tagline">{page.data.settings?.slogans?.[getLocale()] || m.site_tagline()}</p>
		<div class="bottom">
			<p class="copy">{site.copyright || `© ${year} ${site.title}`}</p>
			{#if site.footerText}<p class="footer-note">{site.footerText}</p>{/if}
			<nav class="social" aria-label="social">
				{#each site.socials as link (link.id)}
					<a
						href={link.url}
						target={link.url.startsWith('http') ? '_blank' : undefined}
						rel={link.url.startsWith('http') ? 'noreferrer' : undefined}
					>
						{#if link.display !== 'label' && link.icon && hasIcon(link.icon)}
							<SocialIcon name={link.icon} />
						{/if}
						{#if link.display !== 'icon'}
							<span>{link.label}</span>
						{/if}
					</a>
				{/each}
			</nav>
		</div>
	</div>
</footer>

<style>
	.site-footer {
		border-top: 1px solid var(--color-line);
		margin-top: clamp(5rem, 12vh, 9rem);
		transition: border-color 0.35s ease;
	}

	.footer-inner {
		max-width: 80rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vh, 5rem) 1.5rem 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.brand {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(2.5rem, 6vw, 4rem);
		letter-spacing: -0.03em;
		line-height: 1;
		color: var(--color-ink);
	}

	.tagline {
		font-size: 0.9375rem;
		color: var(--color-ink-muted);
	}

	.bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem 1.5rem;
		margin-top: 2rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-line);
	}

	.footer-note {
		margin: 0.25rem 0 0;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
	.copy {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.social {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.25rem;
	}

	.social a {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.social a:hover {
		color: var(--color-ink);
	}

	@media (max-width: 767px) {
		.bottom {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
