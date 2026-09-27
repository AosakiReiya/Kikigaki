<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	/**
	 * Newsroom home (78e): newspaper anatomy — masthead band, pinned breaking strip,
	 * a lead headline (cover-forward), a dense secondary grid, topics footer.
	 * No personal hero, no scroll narrative; all copy through existing i18n keys.
	 */
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import TagLink from '$lib/components/TagLink.svelte';
	import type { HomeProps } from '../../contracts';

	let { posts, pinned, tags }: HomeProps = $props();

	const lead = $derived(posts[0]);
	// B3: front page = section-stack columns (grouped by category, newspaper-style); grid demoted to fallback
	const rest = $derived(posts.slice(1));
	const sections = $derived.by(() => {
		const byCat = new SvelteMap<string, typeof posts>();
		for (const p of rest) {
			const k = p.categoryDisplay || 'More';
			if (!byCat.has(k)) byCat.set(k, []);
			(byCat.get(k) ?? []).push(p);
		}
		return [...byCat.entries()].slice(0, 4).map(([name, items]) => ({
			name,
			items: items.slice(0, 4),
			moreHref: `/blog?type=${encodeURIComponent(items[0]?.type ?? '')}`
		}));
	});
	const hasSections = $derived(sections.length >= 2);
	const grid = $derived(rest.slice(0, 6));
	const fmtDate = (d: string) => d.slice(0, 10);
</script>

<ExtensionSlot name="home.hero" />

<section class="news">
	{#if pinned.length}
		<div class="breaking">
			<span class="brk-label">{m.home_pinned()}</span>
			<div class="brk-items">
				{#each pinned as p (p.slug)}
					<a href={href(`/blog/${p.slug}`)}>{p.title}</a>
				{/each}
			</div>
		</div>
	{/if}

	{#if lead}
		<a class="lead" href={href(`/blog/${lead.slug}`)}>
			{#if lead.cover}
				<img
					src={lead.cover}
					alt=""
					width="1200"
					height="630"
					loading="eager"
					fetchpriority="high"
				/>
			{/if}
			<div class="lead-text">
				<span class="cat">{lead.categoryDisplay}</span>
				<h1>{lead.title}</h1>
				<p>{lead.summary}</p>
				<span class="date">{fmtDate(lead.date)}</span>
			</div>
		</a>
	{/if}

	{#if hasSections}
		<div class="section-stack">
			{#each sections as sec (sec.name)}
				<section class="sblock">
					<h2 class="s-label">{sec.name}</h2>
					<ol class="s-list">
						{#each sec.items as p (p.slug)}
							<li>
								<a href={href(`/blog/${p.slug}`)}>
									{#if p === sec.items[0] && p.cover}
										<img src={p.cover} alt="" width="320" height="168" loading="lazy" />
									{/if}
									<h3>{p.title}</h3>
									<span class="date">{fmtDate(p.date)}</span>
								</a>
							</li>
						{/each}
					</ol>
					<a class="s-more" href={href(sec.moreHref)}>{m.blog_see_all()} →</a>
				</section>
			{/each}
		</div>
	{:else if grid.length}
		<section class="band">
			<h2 class="band-title">
				{m.home_posts()}
				<a class="all" href={href('/blog')}>{m.blog_see_all()} →</a>
			</h2>
			<div class="grid">
				{#each grid as p (p.slug)}
					<a class="cell" href={href(`/blog/${p.slug}`)}>
						{#if p.cover}
							<img src={p.cover} alt="" width="600" height="315" loading="lazy" />
						{/if}
						<span class="cat">{p.categoryDisplay}</span>
						<h3>{p.title}</h3>
						<span class="date">{fmtDate(p.date)}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if tags.length}
		<footer class="topics">
			<span class="tp-label">{m.home_tags()}</span>
			{#each tags as t (t.name)}
				<TagLink name={t.name} display={t.display} count={t.count} />
			{/each}
		</footer>
	{/if}
</section>

<style>
	.news {
		display: grid;
		gap: 2rem;
		max-width: 78rem;
		margin: 0 auto;
		padding: 1.75rem 1.5rem 3.5rem;
	}

	/* Breaking strip */
	.breaking {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		border: 1px solid var(--color-line);
		border-left: 4px solid var(--color-accent);
		border-radius: 0;
		background: var(--color-bg-elevated);
		padding: 0.75rem 1rem;
		overflow-x: auto;
	}
	.brk-label {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-accent);
	}
	.brk-items {
		display: flex;
		gap: 1.5rem;
	}
	.brk-items a {
		font-size: 0.875rem;
		color: var(--color-ink);
		text-decoration: none;
		white-space: nowrap;
	}
	.brk-items a:hover {
		color: var(--color-accent);
	}

	/* Lead headline */
	.lead {
		display: grid;
		grid-template-columns: 1.4fr 1fr;
		gap: 1.5rem;
		text-decoration: none;
		color: var(--color-ink);
		border: 1px solid var(--color-line);
		border-radius: 0;
		overflow: hidden;
		background: var(--color-bg-elevated);
	}
	.lead img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.lead-text {
		display: grid;
		align-content: center;
		gap: 0.75rem;
		padding: 1.5rem 1.5rem 1.5rem 0;
	}
	.lead h1 {
		margin: 0;
		font-size: var(--text-display);
		line-height: 1.12;
	}
	.lead p {
		margin: 0;
		color: var(--color-ink-muted);
		line-height: 1.6;
	}
	@media (max-width: 47.5rem) {
		.lead {
			grid-template-columns: 1fr;
		}
		.lead-text {
			padding: 0 1.25rem 1.5rem;
		}
	}

	.cat,
	.date {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.cat {
		color: var(--color-accent);
	}
	.date {
		color: var(--color-ink-muted);
	}

	/* Section stack (B3 column blocks) */
	.section-stack {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0 1.75rem;
	}
	.sblock {
		padding: 0 0 1.5rem;
	}
	.s-label {
		margin: 0 0 0.5rem;
		padding-bottom: 0.375rem;
		border-bottom: 3px solid var(--color-ink);
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 0.9375rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.s-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.s-list li + li {
		border-top: 1px solid var(--color-line);
	}
	.s-list a {
		display: block;
		padding: 0.625rem 0;
		text-decoration: none;
		color: var(--color-ink);
	}
	.s-list img {
		width: 100%;
		height: 5.25rem;
		object-fit: cover;
		margin-bottom: 0.375rem;
	}
	.s-list h3 {
		margin: 0 0 0.25rem;
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 0.9375rem;
		line-height: 1.4;
		font-weight: 700;
	}
	.s-list a:hover h3 {
		color: var(--color-accent);
	}
	.s-more {
		display: inline-block;
		margin-top: 0.5rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-accent);
		text-decoration: none;
	}

	/* Secondary grid */
	.band-title {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 1rem;
		margin: 0 0 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-line);
	}
	.all {
		font-size: 0.8125rem;
		color: var(--color-accent);
		text-decoration: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 1rem;
	}
	.cell {
		display: grid;
		gap: 0.5rem;
		align-content: start;
		padding: 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.6rem;
		background: var(--color-bg-elevated);
		text-decoration: none;
		color: var(--color-ink);
		transition:
			border-color 0.15s ease,
			transform 0.15s ease;
	}
	.cell:hover {
		border-color: var(--color-accent);
		transform: translateY(-2px);
	}
	.cell img {
		width: 100%;
		aspect-ratio: 1.9;
		object-fit: cover;
		border-radius: 0.35rem;
	}
	.cell h3 {
		margin: 0;
		font-size: 1rem;
		line-height: 1.35;
	}

	/* Topics footer */
	.topics {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1rem;
		border-top: 3px solid var(--color-ink);
	}
	.tp-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-right: 0.5rem;
	}
</style>
