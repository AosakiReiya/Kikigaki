<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let msg = $state('');
	let busy = $state(false);
	let newSlug = $state('');
	let newTitle = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		try {
			const fd = new FormData(e.currentTarget as HTMLFormElement);
			const res = await fetch('/admin/series?/create', {
				method: 'POST',
				body: fd,
				headers: { accept: 'application/json' }
			});
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'failure') {
				msg = `建立失敗：${j?.data?.message ?? res.status}`;
			} else {
				msg = '✓ 已建立';
				newSlug = '';
				newTitle = '';
				await invalidateAll();
			}
		} finally {
			busy = false;
		}
	}

	async function remove(id: string, title: string) {
		if (!confirm(`確定刪除系列「${title}」？文章本身不受影響，僅移除歸屬。`)) return;
		const fd = new FormData();
		fd.set('id', id);
		const res = await fetch('/admin/series?/remove', {
			method: 'POST',
			body: fd,
			headers: { accept: 'application/json' }
		});
		if (!res.ok) {
			const j = (await res.json().catch(() => null)) as { data?: { message?: string } } | null;
			msg = `刪除失敗：${j?.data?.message ?? res.status}`;
			return;
		}
		msg = '✓ 已刪除';
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>系列 — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">系列</h1>
	<span class="count">共 {data.series.length} 個系列</span>
</div>
<p class="note">
	系列＝有順序的文章群（一稿可入多系）。slug 建立後不可改（是網址識別 /series/…）。
	封面、多語系標題／簡介、發布狀態與成員排序請進入各系列頁面管理。
</p>

{#if msg}<p class="msg">{msg}</p>{/if}

<form class="create" onsubmit={submit}>
	<input
		class="slug-input"
		name="slug"
		placeholder="slug（英數連字號）"
		maxlength="40"
		required
		bind:value={newSlug}
	/>
	<input
		name="title"
		placeholder="系列標題（繁中基準）"
		maxlength="80"
		required
		bind:value={newTitle}
	/>
	<button type="submit" class="ghost primary-text" disabled={busy}>新增系列</button>
</form>

{#if !data.dbReady || data.series.length === 0}
	<p class="empty">還沒有任何系列。</p>
{:else}
	<table class="table">
		<thead>
			<tr>
				<th>標題</th>
				<th>slug</th>
				<th class="num-col">文章數</th>
				<th>狀態</th>
				<th>操作</th>
			</tr>
		</thead>
		<tbody>
			{#each data.series as s (s.id)}
				<tr>
					<td>{s.title}</td>
					<td class="slug-cell">{s.slug}</td>
					<td class="num-col">{s.count}</td>
					<td>{s.published ? '已發布' : '草稿'}</td>
					<td class="actions-cell">
						<a class="ghost primary-text" href="/admin/series/{s.slug}">管理</a>
						<button
							type="button"
							class="ghost danger-text"
							onclick={() => void remove(s.id, s.title)}>刪除</button
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
		margin-bottom: 1rem;
	}

	.msg {
		font-size: 0.8125rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--color-accent) 10%, transparent);
		margin-bottom: 1rem;
	}

	.create {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}

	.create input {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
	}

	.slug-input {
		font-family: var(--font-mono);
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.table th,
	.table td {
		text-align: left;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-line);
	}

	.table th {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		font-weight: 600;
	}

	.num-col {
		text-align: right;
	}

	.slug-cell {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.actions-cell {
		white-space: nowrap;
	}

	.ghost {
		border: 1px solid var(--color-line);
		background: transparent;
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		color: var(--color-ink-muted);
		border-radius: 0.5rem;
		text-decoration: none;
		display: inline-block;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease;
	}

	.ghost:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
		background: var(--color-bg-elevated);
	}

	.danger-text {
		color: #dc2626;
	}

	.primary-text {
		color: var(--color-strong);
		font-weight: 600;
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.875rem;
	}

	/* canonical focus vocabulary (aligned with the posts page) */
	input:focus,
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--color-accent);
	}
</style>
