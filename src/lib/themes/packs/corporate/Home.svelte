<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	/**
	 * Corporate home (78f redesign): asymmetric landing — left value-prop with
	 * inlined stat rail, right visual anchor (latest cover inside a product-frame
	 * mock + floating trust chip), feature-first capability layout (lead block +
	 * compact rows), news as cover cards, full-bleed dark CTA. Enterprise voice,
	 * zero blog residue.
	 */
	import { page } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import type { HomeProps } from '../../contracts';

	let { posts, pinned }: HomeProps = $props();

	const settings = $derived(page.data.settings);
	const tc = $derived(settings?.themeContent ?? {});
	const hero = $derived(
		(tc.hero ?? {}) as {
			eyebrow?: string;
			title?: string;
			body?: string;
			ctas?: Array<{ href: string; label: string }>;
		}
	);
	const svcItems = $derived(
		Array.isArray(tc.services) ? (tc.services as Array<Record<string, unknown>>) : []
	);
	const stats = $derived(
		Array.isArray(tc.stats) ? (tc.stats as Array<Record<string, unknown>>) : []
	);
	const services = $derived<Array<Record<string, unknown>>>(
		svcItems.length > 0
			? svcItems
			: pinned.slice(0, 3).map((p) => ({ title: p.title, text: p.summary }))
	);
	const [svcLead, ...svcRest] = $derived(services);
	const trustChip = $derived(
		typeof tc.trustChip === 'string'
			? tc.trustChip
			: stats.length
				? String(stats[0]?.n ?? '') + ' ' + String(stats[0]?.label ?? '')
				: ''
	);
	const news = $derived(posts.slice(0, 3));
	const heroVisual = $derived(news.find((p) => p.cover)?.cover ?? '');
	const ctas = $derived(
		Array.isArray(hero.ctas) && hero.ctas.length
			? hero.ctas.slice(0, 2)
			: [
					{ href: '/services', label: 'Explore services' },
					{ href: '/contact', label: 'Talk to us' }
				]
	);
	const currentLocale = getLocale();
	const tagline = $derived((settings?.slogans?.[currentLocale] ?? '').trim() || m.site_tagline());
	const ctaTitle = $derived(
		typeof tc.ctaTitle === 'string' ? tc.ctaTitle : 'Have a problem worth solving?'
	);
</script>

<ExtensionSlot name="home.hero" />

<section class="home">
	<header class="hero">
		<div class="hero-copy">
			<p class="eyebrow">{hero.eyebrow ?? site.title}</p>
			<h1>{hero.title ?? tagline}</h1>
			{#if hero.body}<p class="lede">{hero.body}</p>{/if}
			<div class="cta">
				{#each ctas as c, i (i)}
					<a class="btn" class:ghost={i > 0} href={href(c.href)}
						>{c.label}{#if i === 0}<span class="arr" aria-hidden="true">→</span>{/if}</a
					>
				{/each}
			</div>
		</div>
		<div class="hero-visual" aria-hidden="true">
			{#if heroVisual}
				<div class="frame">
					<span class="dots"><i></i><i></i><i></i></span>
					<img src={heroVisual} alt="" width="640" height="360" fetchpriority="high" />
				</div>
			{:else}
				<div class="frame mesh"></div>
			{/if}
			{#if trustChip}
				<span class="chip">{trustChip}</span>
			{/if}
		</div>
	</header>

	{#if stats.length > 0}
		<div class="statbar">
			{#each stats as st, i (i)}
				<div class="cell"><b>{String(st.n ?? '')}</b><span>{String(st.label ?? '')}</span></div>
			{/each}
		</div>
	{/if}

	{#if services.length > 0}
		<section class="cap">
			<div class="cap-head">
				<h2>{typeof tc.servicesTitle === 'string' ? tc.servicesTitle : m.home_pinned()}</h2>
				<a class="textlink" href={href('/services')}
					>{typeof tc.servicesAll === 'string' ? tc.servicesAll : m.blog_see_all()} →</a
				>
			</div>
			<div class="cap-grid">
				{#if svcLead}
					<article class="feature">
						<h3>{typeof svcLead.title === 'string' ? svcLead.title : ''}</h3>
						{#if typeof svcLead.text === 'string'}<p class="big">{svcLead.text}</p>{/if}
						{#if typeof svcLead.meta === 'string'}<span class="meta">{svcLead.meta}</span>{/if}
					</article>
				{/if}
				{#each svcRest as it, i (i)}
					<article class="row">
						<span class="tick" aria-hidden="true"></span>
						<div>
							<h3>{typeof it.title === 'string' ? it.title : ''}</h3>
							{#if typeof it.text === 'string'}<p>{it.text}</p>{/if}
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if news.length > 0}
		<section class="cap">
			<div class="cap-head">
				<h2>{typeof tc.newsTitle === 'string' ? tc.newsTitle : m.home_posts()}</h2>
				<a class="textlink" href={href('/blog')}>{m.blog_see_all()} →</a>
			</div>
			<div class="news-grid">
				{#each news as p (p.slug)}
					<a class="ncard" href={href(`/blog/${p.slug}`)}>
						{#if p.cover}
							<img src={p.cover} alt="" width="600" height="315" loading="lazy" />
						{:else}
							<span class="nillu" aria-hidden="true"><i>{p.title.slice(0, 1)}</i></span>
						{/if}
						<span class="ncat">{p.categoryDisplay}</span>
						<h3>{p.title}</h3>
						<span class="ndate">{p.date.slice(0, 10)}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<footer class="closer">
		<div class="closer-in">
			<h2>{ctaTitle}</h2>
			{#if typeof tc.ctaBody === 'string' || hero.body}
				<p>{typeof tc.ctaBody === 'string' ? tc.ctaBody : hero.body}</p>
			{/if}
			<div class="cta">
				<a class="btn light" href={href('/contact')}
					>{typeof tc.ctaPrimary === 'string' ? tc.ctaPrimary : 'Talk to us'} →</a
				>
				<a class="btn outline" href={href('/services')}
					>{typeof tc.ctaSecondary === 'string' ? tc.ctaSecondary : 'Explore services'}</a
				>
			</div>
		</div>
	</footer>
</section>

<style>
	.home {
		display: grid;
		gap: clamp(4rem, 8vw, 6.5rem);
		padding-bottom: 1rem;
	}

	/* ---------- Hero: asymmetric two-column ---------- */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
		gap: clamp(2rem, 5vw, 4rem);
		align-items: center;
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(3rem, 7vw, 5.5rem) 1.5rem 0;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		margin: 0 0 1.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.eyebrow::before {
		content: '';
		width: 1.75rem;
		height: 1px;
		background: var(--color-accent);
	}
	h1 {
		margin: 0;
		font-size: clamp(2.25rem, 5.2vw, 3.75rem);
		line-height: 1.06;
		letter-spacing: -0.03em;
		font-weight: 800;
		text-wrap: balance;
	}
	.lede {
		margin: 1.5rem 0 0;
		max-width: 40ch;
		font-size: 1.0625rem;
		line-height: 1.75;
		color: var(--color-ink-muted);
	}
	.cta {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-top: 2.25rem;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.625rem;
		border-radius: 0.625rem;
		font-size: 0.9375rem;
		font-weight: 650;
		text-decoration: none;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		transition:
			translate 0.15s ease,
			box-shadow 0.15s ease;
	}
	.btn:hover {
		translate: 0 -1px;
		box-shadow: 0 6px 22px color-mix(in srgb, var(--color-accent) 35%, transparent);
	}
	.btn .arr {
		transition: translate 0.15s ease;
	}
	.btn:hover .arr {
		translate: 3px 0;
	}
	.btn.ghost {
		background: transparent;
		color: var(--color-ink);
		border: 1px solid var(--color-line);
	}
	.btn.ghost:hover {
		border-color: var(--color-ink-muted);
		box-shadow: none;
	}
	.btn.light {
		background: #f4f7fb;
		color: #0a1f44;
	}
	.btn.outline {
		border: 1px solid rgb(255 255 255 / 30%);
		color: #f4f7fb;
	}

	/* right-column visual: product window mock + floating card */
	.hero-visual {
		position: relative;
		min-height: 16rem;
	}
	.frame {
		position: relative;
		border: 1px solid var(--color-line);
		border-radius: 1rem;
		background: linear-gradient(
			160deg,
			color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-elevated)),
			var(--color-bg-elevated) 55%
		);
		box-shadow:
			0 30px 80px -30px rgb(0 0 0 / 55%),
			0 4px 18px rgb(0 0 0 / 22%);
		overflow: hidden;
	}
	.frame img {
		display: block;
		width: 100%;
		height: auto;
		border-top: 1px solid var(--color-line);
		margin-top: 2.125rem;
	}
	.frame.mesh {
		aspect-ratio: 16 / 10;
		background:
			radial-gradient(
				14rem 9rem at 75% 22%,
				color-mix(in srgb, var(--color-accent) 34%, transparent),
				transparent
			),
			repeating-linear-gradient(
				0deg,
				transparent 0 2.25rem,
				color-mix(in srgb, var(--color-line) 55%, transparent) 2.25rem calc(2.25rem + 1px)
			),
			repeating-linear-gradient(
				90deg,
				transparent 0 2.25rem,
				color-mix(in srgb, var(--color-line) 55%, transparent) 2.25rem calc(2.25rem + 1px)
			),
			var(--color-bg-elevated);
	}
	.dots {
		position: absolute;
		inset: 0 0 auto;
		display: flex;
		gap: 0.375rem;
		align-items: center;
		height: 2.125rem;
		padding-left: 0.875rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
	}
	.dots i {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: color-mix(in srgb, var(--color-ink-muted) 45%, transparent);
	}
	.chip {
		position: absolute;
		right: -0.75rem;
		bottom: -1.125rem;
		padding: 0.625rem 1.125rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 14px 34px -12px rgb(0 0 0 / 50%);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-accent);
	}

	/* ---------- stats band ---------- */
	.statbar {
		display: flex;
		flex-wrap: wrap;
		max-width: 72rem;
		margin: 0 auto;
		padding-inline: 1.5rem;
	}
	.statbar .cell {
		flex: 1 1 9rem;
		min-width: 8.5rem;
		display: grid;
		gap: 0.375rem;
		padding: 1.5rem 1.75rem;
		border-left: 1px solid var(--color-line);
	}
	.statbar .cell:first-child {
		padding-left: 0;
		border-left: none;
	}
	.statbar b {
		font-size: clamp(1.75rem, 3vw, 2.375rem);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.statbar span {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	/* ---------- content blocks ---------- */
	.cap {
		max-width: 72rem;
		margin: 0 auto;
		padding-inline: 1.5rem;
		width: 100%;
	}
	.cap-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 0.875rem;
		border-bottom: 1px solid var(--color-line);
	}
	h2 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 750;
		letter-spacing: -0.015em;
	}
	.textlink {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-accent);
		text-decoration: none;
		white-space: nowrap;
	}
	.cap-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 0 3rem;
		align-items: start;
	}
	.feature {
		grid-row: 1 / span 3;
		display: grid;
		align-content: start;
		gap: 0.875rem;
		padding: 2rem;
		border: 1px solid var(--color-line);
		border-radius: 1.125rem;
		background:
			radial-gradient(
				18rem 10rem at 100% 0,
				color-mix(in srgb, var(--color-accent) 9%, transparent),
				transparent
			),
			var(--color-bg-elevated);
	}
	.feature h3 {
		margin: 0;
		font-size: 1.375rem;
		font-weight: 750;
		letter-spacing: -0.015em;
	}
	.feature .big {
		margin: 0;
		font-size: 0.9688rem;
		line-height: 1.75;
		color: var(--color-ink-muted);
	}
	.feature .meta {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.row {
		display: flex;
		gap: 1.125rem;
		padding: 1.375rem 0.25rem;
		border-bottom: 1px solid var(--color-line);
	}
	.tick {
		flex: none;
		width: 1.375rem;
		height: 1.375rem;
		margin-top: 0.125rem;
		border-radius: 0.4375rem;
		background: color-mix(in srgb, var(--color-accent) 16%, transparent);
		position: relative;
	}
	.tick::after {
		content: '';
		position: absolute;
		inset: 0;
		margin: auto;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-accent);
	}
	.row h3 {
		margin: 0 0 0.25rem;
		font-size: 1.0625rem;
		font-weight: 700;
	}
	.row p {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.65;
		color: var(--color-ink-muted);
	}

	/* ---------- news cards ---------- */
	.news-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1.25rem;
	}
	.ncard {
		display: grid;
		gap: 0.5rem;
		align-content: start;
		padding: 1rem 1.125rem 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated);
		text-decoration: none;
		color: var(--color-ink);
		transition:
			border-color 0.15s ease,
			translate 0.15s ease;
	}
	.ncard:hover {
		border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
		translate: 0 -2px;
	}
	.nillu {
		display: grid;
		place-items: center;
		aspect-ratio: 1.9;
		border-radius: 0.5rem;
		margin-bottom: 0.375rem;
		background:
			radial-gradient(
				9rem 5rem at 78% 24%,
				color-mix(in srgb, var(--color-accent) 28%, transparent),
				transparent
			),
			linear-gradient(
				150deg,
				color-mix(in srgb, var(--color-ink) 12%, var(--color-bg-elevated)),
				var(--color-bg-elevated)
			);
		border: 1px solid var(--color-line);
	}
	.nillu i {
		font-style: normal;
		font-weight: 800;
		font-size: 1.5rem;
		color: var(--color-accent);
		opacity: 0.9;
	}
	.ncard img {
		width: 100%;
		aspect-ratio: 1.9;
		object-fit: cover;
		border-radius: 0.5rem;
		margin-bottom: 0.375rem;
	}
	.ncat {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.ncard h3 {
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 700;
		line-height: 1.4;
	}
	.ndate {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	/* ---------- closing CTA (full-width dark) ---------- */
	.closer {
		background:
			radial-gradient(
				40rem 22rem at 88% 0,
				color-mix(in srgb, var(--color-accent) 26%, transparent),
				transparent
			),
			linear-gradient(150deg, #0d2242 0%, #081527 60%, #071a33 100%);
		color: #eef3fa;
	}
	.closer-in {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(3.5rem, 8vw, 5.5rem) 1.5rem;
		text-align: center;
		display: grid;
		justify-items: center;
		gap: 1rem;
	}
	.closer h2 {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.625rem);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.closer p {
		margin: 0;
		max-width: 46ch;
		color: rgb(238 243 250 / 72%);
		line-height: 1.7;
	}
	.closer .cta {
		margin-top: 0.75rem;
		justify-content: center;
	}
	.closer .btn.light:hover {
		box-shadow: 0 6px 22px rgb(0 0 0 / 35%);
	}

	@media (max-width: 62rem) {
		.hero {
			grid-template-columns: 1fr;
			padding-top: 2.5rem;
		}
		.hero-visual {
			order: 2;
		}
		.cap-grid {
			grid-template-columns: 1fr;
		}
		.feature {
			grid-row: auto;
		}
	}
</style>
