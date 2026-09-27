<script lang="ts">
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import SocialIcon, { hasIcon } from '$lib/components/SocialIcon.svelte';

	const year = new Date().getFullYear();
</script>

<footer class="t-footer">
	<div class="t-foot-inner">
		<div class="t-links">
			{#each site.socials as link (link.id)}
				<a
					href={link.url.startsWith('http') ? link.url : href(link.url)}
					target={link.url.startsWith('http') ? '_blank' : undefined}
					rel={link.url.startsWith('http') ? 'noreferrer' : undefined}
				>
					{#if link.icon && hasIcon(link.icon)}<SocialIcon name={link.icon} />{/if}
					<span>{link.label}</span>
				</a>
			{/each}
			<a href="/rss.xml">RSS</a>
		</div>
		<p class="t-exit">
			<span class="t-prompt">visitor@{site.title.toLowerCase()}:~$</span>
			exit <span class="t-code"># {year}</span>
		</p>
	</div>
</footer>

<style>
	.t-footer {
		border-top: 1px solid var(--color-line);
		margin-top: clamp(3rem, 8vh, 6rem);
		padding: 2rem 1.25rem;
	}

	.t-foot-inner {
		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.t-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
	}

	.t-links a {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.t-links a:hover {
		color: var(--color-strong);
	}

	.t-exit {
		margin: 0;
		color: var(--color-ink-muted);
	}

	.t-prompt {
		color: var(--color-strong);
	}

	.t-code {
		color: var(--color-ink);
	}
</style>
