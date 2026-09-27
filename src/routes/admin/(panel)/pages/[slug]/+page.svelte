<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { href } from '$lib/nav';
	import { LOCALE_LABELS } from '$lib/i18n';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import type { Locale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: { message?: string } | null } = $props();

	// one-time editor init: snapshotting data into local state is deliberate semantics (no data-refresh after save, avoiding lost in-edit changes)
	// svelte-ignore state_referenced_locally
	let activeLocale = $state<Locale>(data.activeLocale);
	// svelte-ignore state_referenced_locally
	let published = $state(data.page.published);
	// svelte-ignore state_referenced_locally
	let showInNav = $state(data.page.showInNav);
	// svelte-ignore state_referenced_locally
	let navOrder = $state(data.page.navOrder);
	let saving = $state(false);
	let savedMsg = $state('');

	const EMPTY = { title: '', summary: '', body: '' };
	/* * per-locale edit buffers initialized once (switching locale never loses edits; one save carries all) */
	// svelte-ignore state_referenced_locally
	let drafts = $state<Record<string, { title: string; summary: string; body: string }>>(
		Object.fromEntries(
			data.allLocales.map((l) => [l, { ...(data.translations[l as Locale] ?? EMPTY) }])
		)
	);
	const cur = $derived(drafts[activeLocale]);

	function buildForm() {
		const fd = new FormData();
		if (published) fd.set('published', 'on');
		if (showInNav) fd.set('showInNav', 'on');
		fd.set('navOrder', String(navOrder));
		for (const [loc, tr] of Object.entries(drafts)) {
			fd.set(`title.${loc}`, tr.title);
			fd.set(`summary.${loc}`, tr.summary);
			fd.set(`body.${loc}`, tr.body);
		}
		return fd;
	}

	async function onSave() {
		saving = true;
		savedMsg = '';
		try {
			const res = await fetch('/admin/pages/' + data.slug + '?/save', {
				method: 'POST',
				body: buildForm()
			});
			const j = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
			savedMsg =
				!res.ok || j?.type === 'failure'
					? `儲存失敗：${j?.message ?? res.status}`
					: '✓ 已儲存（即時生效）';
			await invalidateAll();
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>頁面 {data.slug} — Admin</title>
</svelte:head>

<div class="head">
	<a class="back" href="/admin/pages">← 頁面</a>
	<h1 class="title mono">/{data.slug}</h1>
	<span class="grow"></span>
	{#if data.page.published}
		<a class="mini" href={href(`/${data.slug}`)} target="_blank">檢視</a>
	{/if}
	<button type="button" class="primary" disabled={saving} onclick={onSave}
		>{saving ? '儲存中…' : '儲存'}</button
	>
	<form method="POST" action="?/delete">
		<button
			type="submit"
			class="mini danger"
			onclick={(e) => {
				if (!confirm(`刪除 /${data.slug}？`)) e.preventDefault();
			}}>刪除</button
		>
	</form>
</div>
{#if form?.message}<p class="err">{form.message}</p>{/if}
{#if savedMsg}<p class="ok">{savedMsg}</p>{/if}

<div class="flags">
	<label class="flag"><input type="checkbox" bind:checked={published} />已發布</label>
	<label class="flag"><input type="checkbox" bind:checked={showInNav} />顯示於導航</label>
	<label class="flag nav-order">
		排序
		<input class="ord" type="number" min="0" bind:value={navOrder} />
	</label>
</div>

<div class="loc-tabs">
	{#each data.allLocales as loc (loc)}
		<button
			type="button"
			class="loc"
			class:active={loc === activeLocale}
			class:covered={(data.coveredLocales.includes(loc) || drafts[loc]?.title) &&
				loc !== activeLocale}
			onclick={() => (activeLocale = loc)}>{LOCALE_LABELS[loc]}</button
		>
	{/each}
</div>

<div class="edit">
	<input class="f-title" placeholder="標題" bind:value={cur.title} />
	<input
		class="f-summary"
		placeholder="摘要（選填，用於 meta 與頁面頂部）"
		bind:value={cur.summary}
	/>
	<div class="f-body">
		{#key activeLocale}
			<MarkdownEditor
				value={cur.body}
				customNames={data.customNames}
				onChange={(md) => (cur.body = md)}
			/>
		{/key}
	</div>
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.5rem;
	}
	.back {
		color: var(--color-ink-muted);
		text-decoration: none;
		font-size: 0.85rem;
	}
	.title {
		font-size: 1.4rem;
		font-weight: 700;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.grow {
		flex: 1;
	}
	.err {
		color: #e5484d;
		font-size: 0.8rem;
	}
	.ok {
		color: var(--color-strong);
		font-size: 0.8rem;
	}
	.flags {
		display: flex;
		gap: 1.25rem;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	.flag {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.nav-order {
		gap: 0.5rem;
	}
	.ord {
		width: 4.5rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 6px;
		color: inherit;
		padding: 0.25rem 0.4rem;
		font-family: var(--font-mono);
	}
	.loc-tabs {
		display: flex;
		gap: 0.3rem;
		border-bottom: 1px solid var(--color-line);
		margin-bottom: 1rem;
	}
	.loc {
		border: none;
		background: none;
		color: var(--color-ink-muted);
		padding: 0.4rem 0.8rem;
		font-size: 0.8rem;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.loc.active {
		color: inherit;
		border-bottom-color: var(--color-accent);
	}
	.loc.covered::before {
		content: '● ';
		color: var(--color-strong);
		font-size: 0.6rem;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.f-title,
	.f-summary {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 6px;
		color: inherit;
		padding: 0.5rem 0.7rem;
	}
	.f-title {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.f-summary {
		font-size: 0.9rem;
	}
	.f-body {
		min-height: 50vh;
	}
	.mini {
		font-size: 0.75rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-decoration: none;
	}
	.danger:hover {
		border-color: #e5484d;
		color: #e5484d;
	}
	.primary {
		border: none;
		border-radius: 6px;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		padding: 0.25rem 0.9rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
</style>
