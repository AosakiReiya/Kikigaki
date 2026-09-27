<script lang="ts">
	/**
	 * Corporate Services page (78f B2, theme context route /services).
	 * Content-first: theme_content.pages.services.blocks (title/intro/items[]);
	 * graceful fallback = pinned posts presented as capability cards, then empty state.
	 */
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import type { ThemeRouteProps } from '../../contracts';

	let { slug, content, themeContent }: ThemeRouteProps = $props();

	const title = $derived(typeof content?.title === 'string' ? content.title : '服務與能力');
	const intro = $derived(typeof content?.intro === 'string' ? content.intro : '');
	const items = $derived(
		Array.isArray(content?.items) ? (content?.items as Array<Record<string, unknown>>) : []
	);
	const contactHref = $derived(
		(themeContent as { contactPage?: boolean }).contactPage === false ? '/about' : '/contact'
	);
	void slug;
</script>

<svelte:head>
	<title>{title} — {(page.data.settings?.name ?? '') || 'Kikigaki'}</title>
</svelte:head>

<section class="svc">
	<header class="svc-hero">
		<h1>{title}</h1>
		{#if intro}<p class="lede">{intro}</p>{/if}
	</header>

	{#if items.length > 0}
		<div class="grid">
			{#each items as it, i (i)}
				<article class="card">
					<span class="idx">{String(i + 1).padStart(2, '0')}</span>
					<h2>{typeof it.title === 'string' ? it.title : ''}</h2>
					{#if typeof it.text === 'string'}<p>{it.text}</p>{/if}
					{#if typeof it.meta === 'string'}<span class="meta">{it.meta}</span>{/if}
				</article>
			{/each}
		</div>
	{:else}
		<p class="hint-empty">
			此頁內容由「主題內容」(<code>theme_content.pages.{slug}</code>) 驅動——在主題工作台填入 title /
			intro / items 即成形。
		</p>
	{/if}

	<footer class="cta-band">
		<p>{m.about_cta_title()}</p>
		<a class="btn" href={href(contactHref)}>{m.nav_about()} →</a>
	</footer>
</section>

<style>
	.svc {
		max-width: 68rem;
		margin: 0 auto;
		padding: 3.5rem 1.5rem 1rem;
	}
	.svc-hero {
		max-width: 44rem;
		margin-bottom: 3rem;
	}
	h1 {
		font-size: clamp(1.875rem, 4vw, 2.625rem);
		font-weight: 700;
		letter-spacing: -0.015em;
		margin: 0 0 0.75rem;
	}
	.lede {
		margin: 0;
		font-size: 1.0625rem;
		line-height: 1.7;
		color: var(--color-ink-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
		gap: 1.25rem;
	}
	.card {
		display: grid;
		gap: 0.625rem;
		align-content: start;
		padding: 1.75rem;
		border: 1px solid var(--color-line);
		border-radius: 1rem;
		background: var(--color-bg-elevated);
	}
	.idx {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--color-accent);
	}
	.card h2 {
		margin: 0;
		font-size: 1.1875rem;
		font-weight: 650;
	}
	.card p {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.7;
		color: var(--color-ink-muted);
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}
	.hint-empty {
		padding: 2.5rem 1.5rem;
		border: 1px dashed var(--color-line);
		border-radius: 1rem;
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
		text-align: center;
	}
	.cta-band {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		flex-wrap: wrap;
		margin-top: 3.5rem;
		padding: 2.25rem;
		border-radius: 1rem;
		background:
			radial-gradient(
				22rem 12rem at 90% 0,
				color-mix(in srgb, var(--color-accent) 24%, transparent),
				transparent
			),
			linear-gradient(150deg, #0d2242 0%, #081527 60%, #071a33 100%);
		color: #eef3fa;
	}
	.cta-band p {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.btn {
		display: inline-block;
		padding: 0.625rem 1.375rem;
		border-radius: 0.625rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 650;
		font-size: 0.9375rem;
		text-decoration: none;
		transition:
			translate 0.15s ease,
			box-shadow 0.15s ease;
	}
	.btn:hover {
		translate: 0 -1px;
		box-shadow: 0 6px 22px color-mix(in srgb, var(--color-accent) 35%, transparent);
	}
</style>
