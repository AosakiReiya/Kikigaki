<script lang="ts">
	/**
	 * Release About page (public edition). The internal site ships a full GSAP scroll
	 * narrative here; this simpler-but-clean layout is what forks get out of the box —
	 * swapped in by scripts/make-release-repo.mjs at release time. Same AboutProps
	 * contract, no animation dependencies, all copy via existing i18n keys.
	 */
	import { page } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { site } from '$lib/site';
	import PostBody from '$lib/components/PostBody.svelte';
	import type { AboutProps } from '$lib/themes/contracts';

	let { aboutHtml, stats, showcase, tags }: AboutProps = $props();

	const locale = getLocale();
	const settings = $derived(page.data.settings);
	const name = $derived(settings?.authorName || site.author.name);
	const statItems = $derived([
		{ n: stats.posts, label: m.about_stat_posts() },
		{ n: stats.views, label: m.about_stat_views() },
		{ n: stats.tags, label: m.about_stat_tags() }
	]);
</script>

<svelte:head>
	<title>{m.about_me_title()} — {site.title}</title>
</svelte:head>

<section class="about">
	<header class="hero">
		<img src={site.author.avatar} alt="" width="96" height="96" class="avatar" />
		<h1>{name}</h1>
		<p class="tagline">{settings?.slogans?.[locale] || m.site_tagline()}</p>
	</header>

	{#if aboutHtml}
		<article class="bio">
			<!-- aboutHtml comes from the site owner's own published page (trusted, admin-authored) -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<PostBody html={aboutHtml} />
		</article>
	{/if}

	<div class="stats" role="group" aria-label={m.about_stats_aria()}>
		{#each statItems as s (s.label)}
			<div class="stat">
				<b>{s.n}</b>
				<span>{s.label}</span>
			</div>
		{/each}
	</div>

	{#if showcase.length}
		<h2>{m.about_work_note()}</h2>
		<ul class="showcase">
			{#each showcase as item (item.href)}
				<li>
					<a href={item.href}>
						<strong>{item.title}</strong>
						<span>{item.description}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if tags.length}
		<h2>{m.about_tags_title()}</h2>
		<p class="tags">
			{#each tags as t (t.name)}
				<a class="tag" href={href(`/blog?tag=${encodeURIComponent(t.name)}`)}>{t.display}</a>
			{/each}
		</p>
	{/if}

	<footer class="cta">
		<h2>{m.about_cta_title()}</h2>
		<p>
			<a href={href('/blog')}>{m.about_cta_blog()}</a>
			<a href={href('/')}>{m.about_cta_home()}</a>
		</p>
	</footer>
</section>

<style>
	.about {
		max-width: 46rem;
		margin: 0 auto;
		padding: 3rem 1.25rem 5rem;
	}
	.hero {
		text-align: center;
		margin-bottom: 2.5rem;
	}
	.avatar {
		border-radius: 9999px;
		border: 1px solid var(--color-line);
	}
	h1 {
		font-size: 1.75rem;
		margin: 0.75rem 0 0.25rem;
	}
	.tagline {
		color: var(--color-ink-muted);
		margin: 0;
	}
	h2 {
		font-size: 1rem;
		margin: 2.5rem 0 0.75rem;
	}
	.bio {
		margin-bottom: 1rem;
	}
	.stats {
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.stat {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 0.75rem 1.25rem;
		text-align: center;
		background: var(--color-bg-elevated);
	}
	.stat b {
		display: block;
		font-size: 1.75rem;
		font-family: var(--font-mono);
	}
	.stat span {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}
	.showcase {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}
	.showcase a {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		text-decoration: none;
		color: var(--color-ink);
		transition: border-color 0.2s ease;
	}
	.showcase a:hover {
		border-color: var(--color-accent);
	}
	.showcase span {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tag {
		font-size: 0.8125rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.15rem 0.7rem;
		text-decoration: none;
		color: var(--color-ink-muted);
	}
	.cta {
		margin-top: 3rem;
		text-align: center;
	}
	.cta p {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}
	.cta a {
		color: var(--color-accent);
	}
</style>
