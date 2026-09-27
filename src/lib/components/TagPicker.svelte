<script lang="ts">
	/**
	 * Tag picker: chips + input suggestions + direct creation.
	 * Values are base names (zh-tw name = URL identity); new names are created directly (the backend auto-upserts on save).
	 */
	import { menuDropdown } from '$lib/animation/menu';

	let {
		tags,
		allTags = [],
		onChange
	}: {
		tags: string[];
		allTags?: string[];
		onChange: (next: string[]) => void;
	} = $props();

	let query = $state('');
	let open = $state(false);
	let cursor = $state(0);
	let boxEl = $state<HTMLElement | undefined>();

	const selected = $derived(new Set(tags));
	// focusing lists all existing tags (empty input = everything selectable); typing filters, creation offered only with no match
	const suggestions = $derived(
		allTags.filter(
			(t) =>
				!selected.has(t) &&
				(query.trim() === '' || t.toLowerCase().includes(query.trim().toLowerCase()))
		)
	);
	const canCreate = $derived(
		query.trim().length > 0 && !selected.has(query.trim()) && suggestions.length === 0
	);
	const visible = $derived(suggestions);
	const menuOpen = $derived(open && (visible.length > 0 || query.trim() !== ''));

	function commit(raw: string) {
		const name = raw
			.trim()
			.replace(/[,，]+$/, '')
			.trim();
		if (!name || selected.has(name)) {
			query = '';
			return;
		}
		onChange?.([...tags, name]);
		query = '';
		cursor = 0;
	}

	function remove(name: string) {
		onChange?.(tags.filter((t) => t !== name));
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (visible[cursor]) commit(visible[cursor]);
			else commit(query);
		} else if (e.key === ',' || e.key === '，') {
			e.preventDefault();
			commit(query);
		} else if (e.key === 'Backspace' && query === '' && tags.length > 0) {
			remove(tags[tags.length - 1]);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(cursor + 1, Math.max(visible.length - 1, 0));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(cursor - 1, 0);
		} else if (e.key === 'Escape') {
			open = false;
		}
	}

	$effect(() => {
		function onDoc(e: MouseEvent) {
			if (boxEl && !e.composedPath().includes(boxEl)) open = false;
		}
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	});
</script>

<div class="tag-picker" bind:this={boxEl} use:menuDropdown={{ open: menuOpen }}>
	<div class="box">
		{#each tags as name (name)}
			<span class="chip">
				#{name}
				<button type="button" class="x" aria-label="移除 {name}" onclick={() => remove(name)}
					>×</button
				>
			</span>
		{/each}
		<input
			type="text"
			class="input"
			placeholder={tags.length === 0 ? '輸入或點選標籤…' : ''}
			bind:value={query}
			onfocus={() => (open = true)}
			oninput={() => (open = true)}
			onkeydown={onKeydown}
		/>
	</div>
	<ul class="pop" role="listbox" data-menu-panel inert={menuOpen ? undefined : true}>
		{#each visible as s, i (s)}
			<li role="option" aria-selected={i === cursor} class:hi={i === cursor}>
				<button
					type="button"
					onmousedown={(e) => {
						e.preventDefault();
						commit(s);
					}}>#{s}</button
				>
			</li>
		{/each}
		{#if canCreate}
			<li role="option" aria-selected={visible.length === cursor}>
				<button
					type="button"
					class="create"
					onmousedown={(e) => {
						e.preventDefault();
						commit(query);
					}}>＋ 建立「{query.trim()}」</button
				>
			</li>
		{/if}
	</ul>
</div>

<style>
	.tag-picker {
		position: relative;
	}

	.box {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		align-items: center;
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.5rem 0.625rem;
		min-height: 2.5rem;
		cursor: text;
	}

	.box:focus-within {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.125rem 0.25rem 0.125rem 0.625rem;
		font-size: 0.8125rem;
		color: var(--color-ink);
	}

	.x {
		appearance: none;
		background: none;
		border: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0 0.3125rem;
		border-radius: 9999px;
	}

	.x:hover {
		color: #e5484d;
	}

	.input {
		flex: 1;
		min-width: 8rem;
		border: none;
		background: none;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
		padding: 0.25rem 0.125rem;
	}

	.input:focus {
		outline: none;
	}

	.pop {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 0;
		right: 0;
		z-index: 30;
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		max-height: 14rem;
		overflow-y: auto;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		/* initially collapsed: GSAP autoAlpha takes over (panel resident to support open/close animation) */
		visibility: hidden;
		opacity: 0;
	}

	.pop button {
		display: block;
		width: 100%;
		text-align: left;
		appearance: none;
		background: none;
		border: none;
		border-radius: 0.375rem;
		padding: 0.4375rem 0.625rem;
		font: inherit;
		font-size: 0.875rem;
		color: var(--color-ink);
		cursor: pointer;
	}

	.hi button,
	.pop button:hover {
		background: rgb(255 255 255 / 0.07);
	}

	.create {
		color: var(--color-accent) !important;
	}
</style>
