<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import { page as app } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import { formatDate } from '$lib/format';
	import { blogQuery } from '$lib/blog-params';
	import { site } from '$lib/site';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { HomeProps } from '../../contracts';

	let { posts, pinned, tags }: HomeProps = $props();

	const settings = $derived(app.data.settings);
	const currentLocale = $derived(getLocale());
	const tagline = $derived((settings?.slogans?.[currentLocale] ?? '').trim() || m.site_tagline());

	/** ls -la mode column: pinned = executable rwx, the rest read-only */
	const mode = (isPinned: boolean) => (isPinned ? 'drwxr-xr-x' : '-rw-r--r--');

	function rows(list: typeof posts, base: number) {
		return list.map((p, i) => ({
			...p,
			n: String(base + i + 1).padStart(2, '0')
		}));
	}
	const pinnedRows = $derived(rows(pinned, 0));
	const postRows = $derived(rows(posts, pinned.length));
</script>

<ExtensionSlot name="home.hero" />

<section class="t-hero">
	<h1 class="t-boot">
		<span class="t-boot-line">$ ./about</span>
		<span class="t-boot-line">user : {site.author.username}</span>
		<span class="t-boot-line">site : {site.title}</span>
		<span class="t-boot-line">status : online</span>
	</h1>
	<p class="t-tag">{tagline}</p>
</section>

{#if pinnedRows.length > 0}
	<section class="t-block">
		<h2 class="t-cmd-head"><span class="t-prompt">$</span> cat ~/pinned</h2>
		<table class="t-ls">
			<thead>
				<tr>
					<th>mode</th>
					<th><span class="sr">date</span></th>
					<th>entry</th>
					<th>tags</th>
				</tr>
			</thead>
			<tbody>
				{#each pinnedRows as p (p.slug)}
					<tr>
						<td class="t-mode">{mode(true)}</td>
						<td class="t-date">{formatDate(p.date)}</td>
						<td class="t-name">
							<a href={href(`/blog/${p.slug}`)}>{p.title}</a>
							{#if !p.translated}<span class="t-flag">*</span>{/if}
						</td>
						<td class="t-tags">
							{#each p.tags as t (t.name)}<span>#{t.display}</span>{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}

<section class="t-block">
	<h2 class="t-cmd-head"><span class="t-prompt">$</span> ls -la ~/posts</h2>
	<table class="t-ls">
		<thead>
			<tr>
				<th>mode</th>
				<th><span class="sr">date</span></th>
				<th>entry</th>
				<th>tags</th>
			</tr>
		</thead>
		<tbody>
			{#each postRows as p (p.slug)}
				<tr>
					<td class="t-mode">{mode(p.pinned)}</td>
					<td class="t-date">{formatDate(p.date)}</td>
					<td class="t-name">
						<a href={href(`/blog/${p.slug}`)}>{p.title}</a>
						{#if !p.translated}<span class="t-flag">*</span>{/if}
					</td>
					<td class="t-tags">
						{#each p.tags as t (t.name)}<span>#{t.display}</span>{/each}
					</td>
				</tr>
			{:else}
				<tr>
					<td class="t-empty" colspan="4">（無輸出 — 還沒有文章）</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<p class="t-seeall">
		<a href={href('/blog')}>$ ls ~/posts --all →</a>
	</p>
</section>

{#if tags.length > 0}
	<section class="t-block">
		<h2 class="t-cmd-head"><span class="t-prompt">$</span> ls ~/tags</h2>
		<div class="t-taglist">
			{#each tags as tag (tag.name)}
				<a href={href('/blog' + blogQuery({ tag: tag.name }))}
					>{tag.display}/ <span>({tag.count})</span></a
				>
			{/each}
		</div>
	</section>
{/if}

<style>
	.t-hero {
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(2.5rem, 7vh, 4.5rem) 1.25rem 1rem;
	}

	.t-boot {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		line-height: 1.7;
		color: var(--color-ink);
		font-weight: 400;
		margin: 0;
		display: flex;
		flex-direction: column;
		letter-spacing: 0;
	}

	.t-boot-line {
		white-space: pre-wrap;
	}

	.t-tag {
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
		margin: 0.5rem 0 0;
		font-size: 0.875rem;
	}

	.t-block {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1.5rem 1.25rem;
	}

	.t-cmd-head {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--color-ink);
		margin: 0 0 1rem;
	}

	.t-prompt {
		color: var(--color-strong);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}

	.t-ls {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.t-ls thead th {
		text-align: left;
		font-weight: 500;
		color: var(--color-ink-muted);
		border-bottom: 1px solid var(--color-line);
		padding: 0.35rem 0.75rem 0.35rem 0;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.t-ls td {
		padding: 0.5rem 0.75rem 0.5rem 0;
		border-bottom: 1px dashed var(--color-line);
		vertical-align: top;
	}

	.t-mode {
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.t-date {
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.t-name a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-name a:hover {
		color: var(--color-strong);
	}

	.t-flag {
		color: var(--color-strong);
	}

	.t-tags {
		color: var(--color-ink-muted);
	}

	.t-tags span {
		margin-right: 0.5rem;
	}

	.t-empty {
		color: var(--color-ink-muted);
	}

	.t-pager {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.t-pager a {
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.t-pager a:hover {
		color: var(--color-strong);
	}

	.t-pos {
		color: var(--color-ink);
	}

	.t-seeall {
		margin: 1rem 0 0;
		font-size: 0.85rem;
	}

	.t-seeall a {
		color: var(--color-strong);
		text-decoration: none;
	}

	.t-taglist {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.25rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}

	.t-taglist a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.t-taglist a:hover {
		color: var(--color-strong);
	}

	.t-taglist span {
		color: var(--color-ink-muted);
	}

	@media (max-width: 767px) {
		.t-ls thead {
			display: none;
		}
		.t-mode,
		.t-date {
			display: none;
		}
	}
</style>
