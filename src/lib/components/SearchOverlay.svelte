<script lang="ts">
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { href } from '$lib/nav';
	import type { SearchIndexEntry as SearchIndexItem } from '$lib/plugins/types';

	let {
		open,
		onClose
	}: {
		open: boolean;
		onClose: () => void;
	} = $props();

	let query = $state('');
	let selected = $state(0);
	/* * 79a-slim: query data now fetched on demand via /api/search (FTS + pages LIKE); no site-wide resident index */
	let results = $state<SearchIndexItem[]>([]);
	let searching = $state(false);
	let seq = 0;

	/* * post/page link routing (kind decides the path prefix) */
	function linkOf(item: SearchIndexItem) {
		return item.kind === 'page' ? `/${item.slug}` : `/blog/${item.slug}`;
	}

	$effect(() => {
		if (open) {
			query = '';
			selected = 0;
		}
	});

	// probe search: 180ms debounce + a token guarding against stale responses overwriting (FTS lives at /api/search)
	$effect(() => {
		const q = query.trim();
		if (!open || !q) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		const my = ++seq;
		const t = setTimeout(() => {
			void fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
				.then((r) => (r.ok ? r.json() : { results: [] }))
				.then((j: { results?: SearchIndexItem[] }) => {
					if (my !== seq) return;
					results = (j.results ?? []).slice(0, 8);
					selected = 0;
				})
				.catch(() => {
					if (my === seq) results = [];
				})
				.finally(() => {
					if (my === seq) searching = false;
				});
		}, 180);
		return () => clearTimeout(t);
	});

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const item = results[selected];
			if (item) {
				onClose();
				void goto(href(linkOf(item)));
			} else if (query.trim()) {
				// local index missed → go to /search for site-wide full text
				onClose();
				void goto(href(`/search?q=${encodeURIComponent(query.trim())}`));
			}
			return;
		}
		if (results.length === 0) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = (selected + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = (selected - 1 + results.length) % results.length;
		}
	}
</script>

{#if open}
	<div class="search-backdrop" onclick={() => onClose()}></div>
	<div class="search" role="dialog" aria-modal="true" aria-label={m.search_title()}>
		<div class="search-input-wrap">
			<span class="search-icon" aria-hidden="true">⌕</span>
			<input
				class="search-input"
				type="search"
				placeholder={m.search_placeholder()}
				bind:value={query}
				onkeydown={onKeydown}
				autocomplete="off"
			/>
			<button class="close" onclick={onClose} aria-label={m.search_close()}>✕</button>
		</div>

		{#if searching && results.length === 0}
			<p class="empty">⋯</p>
		{:else if query.trim() && results.length === 0}
			<p class="empty">{m.search_empty({ query })}</p>
			<p class="go-all">
				<a href={href(`/search?q=${encodeURIComponent(query.trim())}`)} onclick={() => onClose()}>
					{m.search_view_all()} →
				</a>
			</p>
		{:else if results.length > 0}
			<ul class="results">
				{#each results as item, i (`${item.kind}:${item.slug}`)}
					<li>
						<a
							class="result"
							class:selected={i === selected}
							href={href(linkOf(item))}
							onmouseenter={() => (selected = i)}
							onclick={() => onClose()}
						>
							<span class="r-title">{item.title}</span>
							<span class="r-meta">
								{#if item.kind === 'page'}<span class="tag">頁面</span>{/if}
								{#each item.tags.slice(0, 3) as tag (tag.name)}<span class="tag"
										>#{tag.display}</span
									>{/each}
							</span>
							{#if item.summary}<span class="r-summary">{item.summary}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
			<p class="go-all">
				<a href={href(`/search?q=${encodeURIComponent(query.trim())}`)} onclick={() => onClose()}>
					{m.search_view_all()} →
				</a>
			</p>
		{/if}
	</div>
{/if}

<style>
	.search-backdrop {
		position: fixed;
		inset: 0;
		z-index: 95;
		background: rgb(0 0 0 / 0.55);
		backdrop-filter: blur(2px);
	}

	.search {
		position: fixed;
		top: 5.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: min(38rem, calc(100vw - 2rem));
		z-index: 96;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 1rem;
		box-shadow: 0 1.5rem 3rem rgb(0 0 0 / 0.45);
		overflow: hidden;
	}

	.search-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--color-line);
	}

	.search-icon {
		color: var(--color-ink-muted);
		font-size: 1.25rem;
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--color-ink);
		font: inherit;
		font-size: 1rem;
	}

	.search-input::placeholder {
		color: var(--color-ink-muted);
	}

	.close {
		appearance: none;
		background: none;
		border: none;
		color: var(--color-ink-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.25rem;
	}

	.close:hover {
		color: var(--color-ink);
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0.5rem;
		max-height: min(55vh, 32rem);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.result {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.625rem 0.75rem;
		border-radius: 0.625rem;
		text-decoration: none;
		color: var(--color-ink);
	}

	.result.selected {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
	}

	.r-title {
		font-family: var(--font-display);
		font-weight: 600;
	}

	.r-meta {
		display: flex;
		gap: 0.5rem;
	}

	.tag {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.r-summary {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.empty {
		padding: 1.5rem;
		text-align: center;
		color: var(--color-ink-muted);
		font-size: 0.875rem;
	}

	.go-all {
		text-align: center;
		padding: 0.75rem 1.5rem 1.25rem;
		margin: 0;
		border-top: 1px solid var(--color-line);
	}

	.go-all a {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-strong);
		text-decoration: none;
	}
</style>
