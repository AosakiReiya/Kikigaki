<script lang="ts">
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let shown = $state(20);
	const visible = $derived((data.comments ?? []).slice(0, shown));

	/* * Phase 76: batch operations — checkbox selection + submit */
	const selected = new SvelteSet<string>();
	let bulkBusy = $state(false);
	let bulkMsg = $state('');
	const allVisibleSelected = $derived(
		visible.length > 0 && visible.every((c) => selected.has(c.id))
	);
	function toggle(id: string): void {
		if (selected.has(id)) selected.delete(id);
		else selected.add(id);
	}
	function toggleAll(): void {
		selected.clear();
		if (!allVisibleSelected) for (const c of visible) selected.add(c.id);
	}
	async function bulkSend(op: 'approve' | 'spam' | 'reject' | 'pending' | 'delete'): Promise<void> {
		if (bulkBusy || selected.size === 0) return;
		if (op === 'delete' && !confirm(`確定刪除 ${selected.size} 則評論？此操作不可復原。`)) return;
		bulkBusy = true;
		bulkMsg = '';
		const fd = new FormData();
		fd.set('op', op);
		for (const id of selected) fd.append('ids', id);
		try {
			const res = await fetch('/admin/comments?/bulk', { method: 'POST', body: fd });
			if (res.ok) {
				location.reload();
				return;
			}
			bulkMsg = '❌ 批次操作失敗';
		} catch {
			bulkMsg = '❌ 網路錯誤';
		} finally {
			bulkBusy = false;
		}
	}

	const tabs: { value: 'pending' | 'approved' | 'rejected' | 'spam'; label: string }[] = [
		{ value: 'pending', label: '待審' },
		{ value: 'approved', label: '已通過' },
		{ value: 'rejected', label: '已拒絕' },
		{ value: 'spam', label: '垃圾' }
	];

	const current = $derived(data.status);
</script>

<svelte:head>
	<title>評論管理 — Admin</title>
</svelte:head>

<h1 class="title">評論管理</h1>
<p class="mod-link">
	<a href="/admin/settings#moderation">審核強度與禁詞表 → 設定頁「評論審核」卡</a>
</p>

<nav class="tabs">
	{#each tabs as tab (tab.value)}
		<a href="/admin/comments?status={tab.value}" class:active={current === tab.value}>
			{tab.label}
			{#if data.counts[tab.value] != null}
				<span class="count">{data.counts[tab.value]}</span>
			{/if}
		</a>
	{/each}
</nav>

{#if selected.size > 0}
	<div class="bulkbar" role="toolbar" aria-label="批次操作">
		<b>已選 {selected.size} 則</b>
		<button type="button" class="ok" disabled={bulkBusy} onclick={() => void bulkSend('approve')}
			>通過</button
		>
		<button type="button" class="bad" disabled={bulkBusy} onclick={() => void bulkSend('spam')}
			>垃圾</button
		>
		<button type="button" class="bad" disabled={bulkBusy} onclick={() => void bulkSend('reject')}
			>拒絕</button
		>
		<button type="button" disabled={bulkBusy} onclick={() => void bulkSend('pending')}
			>移回待審</button
		>
		<button type="button" class="bad" disabled={bulkBusy} onclick={() => void bulkSend('delete')}
			>刪除</button
		>
		<button type="button" class="linkish" disabled={bulkBusy} onclick={() => selected.clear()}
			>取消選擇</button
		>
		{#if bulkMsg}<span class="bulk-msg" role="status">{bulkMsg}</span>{/if}
	</div>
{/if}

{#if !data.dbReady}
	<p class="empty">資料庫未配置。</p>
{:else if data.comments.length === 0}
	<p class="empty">這個分類下沒有評論。</p>
{:else}
	<div class="selectall">
		<label class="check">
			<input type="checkbox" checked={allVisibleSelected} onchange={toggleAll} />
			全選本頁（{visible.length}）
		</label>
	</div>
	<ul class="comments">
		{#each visible as comment (comment.id)}
			{@const signals = comment.moderationResult
				? (() => {
						try {
							return JSON.parse(comment.moderationResult);
						} catch {
							return null;
						}
					})()
				: null}
			{@const reasons = comment.riskReasons
				? (() => {
						try {
							return JSON.parse(comment.riskReasons) as string[];
						} catch {
							return [];
						}
					})()
				: []}
			{@const patternSamples = comment.patternSamples
				? (() => {
						try {
							return JSON.parse(comment.patternSamples) as string[];
						} catch {
							return [];
						}
					})()
				: []}
			<li class="comment">
				<p class="comment-meta">
					<label class="check rowcheck" aria-label="選擇此評論">
						<input
							type="checkbox"
							checked={selected.has(comment.id)}
							onchange={() => toggle(comment.id)}
						/>
					</label>
					<strong>{comment.name}</strong>
					{#if comment.repliedTo}
						<span class="reply-badge">↩ {comment.repliedTo}</span>
					{/if}
					{#if comment.email}<span class="muted">{comment.email}</span>{/if}
					<time>{formatDate(comment.createdAt.toISOString().slice(0, 10))}</time>
					<a class="muted" href="/blog/{comment.slug}" target="_blank" rel="noreferrer"
						>→ {comment.slug}</a
					>
					<span
						class="risk"
						class:risk-low={comment.riskScore < 30}
						class:risk-mid={comment.riskScore >= 30 && comment.riskScore < 90}
						class:risk-high={comment.riskScore >= 90}>Risk {comment.riskScore}</span
					>
				</p>
				{#if reasons.length > 0}
					<p class="reasons">
						{#each reasons as reason (reason)}
							<span class="chip">{reason}</span>
						{/each}
						{#if comment.patternHits > 0}
							<span class="chip" title={patternSamples.join(' · ')}
								>corpus ×{comment.patternHits}</span
							>
						{/if}
					</p>
				{/if}
				{#if signals}
					<p class="muted signals">
						spam {Number(signals.spam ?? 0).toFixed(2)} · hate
						{Number(signals.hate ?? 0).toFixed(2)} · threat
						{Number(signals.threat ?? 0).toFixed(2)}
					</p>
				{/if}
				{#if comment.turnstileResult}
					<p class="muted signals">turnstile: {comment.turnstileResult}</p>
				{/if}
				<p class="comment-body">{comment.content}</p>
				<div class="actions">
					{#if current !== 'approved'}
						<form method="POST" action="?/approve">
							<input type="hidden" name="id" value={comment.id} />
							<button type="submit" class="ok">通過</button>
						</form>
					{/if}
					{#if current !== 'spam'}
						<form method="POST" action="?/spam">
							<input type="hidden" name="id" value={comment.id} />
							<button type="submit" class="bad">垃圾</button>
						</form>
					{/if}
					{#if current !== 'rejected'}
						<form method="POST" action="?/reject">
							<input type="hidden" name="id" value={comment.id} />
							<button type="submit" class="bad">拒絕</button>
						</form>
					{/if}
					{#if current !== 'pending'}
						<form method="POST" action="?/pending">
							<input type="hidden" name="id" value={comment.id} />
							<button type="submit">移回待審</button>
						</form>
					{/if}
					<form method="POST" action="?/delete">
						<input type="hidden" name="id" value={comment.id} />
						<button type="submit" class="bad">刪除</button>
					</form>
				</div>
			</li>
		{/each}
		{#if data.comments.length > shown}
			<button type="button" class="more-btn" onclick={() => (shown += 20)}>
				載入更多（還有 {data.comments.length - shown} 則）
			</button>
		{/if}
	</ul>
{/if}

{#if page.url.searchParams.get('status')}
	<!-- keep URL in sync for tab state -->
{/if}

<style>
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
	}

	.tabs a {
		padding: 0.375rem 0.875rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.tabs a:hover {
		color: var(--color-ink);
	}

	.tabs a.active {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
	}

	.count {
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border-radius: 9999px;
		background: var(--color-bg-elevated);
		font-size: 0.6875rem;
		line-height: 1.25rem;
	}

	.tabs a.active .count {
		background: var(--color-accent-ink);
		color: var(--color-accent);
	}

	.risk {
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.risk-low {
		color: #22c55e;
		border: 1px solid #22c55e;
	}

	.risk-mid {
		color: #f59e0b;
		border: 1px solid #f59e0b;
	}

	.risk-high {
		color: #ef4444;
		border: 1px solid #ef4444;
	}

	.signals {
		font-size: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.reasons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 0.5rem;
	}

	.chip {
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.bulkbar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.75rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
	}
	.bulkbar b {
		font-size: 0.875rem;
		margin-right: 0.25rem;
	}
	.bulkbar button {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		border-radius: 0.5rem;
		padding: 0.25rem 0.75rem;
		font-size: 0.8125rem;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}
	.bulkbar button:hover:not(:disabled) {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.bulkbar button.ok:hover:not(:disabled) {
		color: #22c55e;
		border-color: #22c55e;
	}
	.bulkbar button.bad:hover:not(:disabled) {
		color: #ef4444;
		border-color: #ef4444;
	}
	.bulkbar button.linkish {
		border: none;
		text-decoration: underline;
	}
	.bulkbar button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.bulk-msg {
		font-size: 0.8125rem;
		color: #ef4444;
	}
	.selectall {
		margin: 0.75rem 0 0.25rem;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		cursor: pointer;
	}
	.rowcheck {
		margin-right: 0.25rem;
	}
	.mod-link {
		margin: 0.25rem 0 0;
	}
	.mod-link a {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.mod-link a:hover {
		color: var(--color-ink);
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}

	.comments {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.comment {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 1rem 1.25rem;
		background: var(--color-bg-elevated);
	}

	.reply-badge {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.0625rem 0.5rem;
	}

	.comment-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.8125rem;
		margin-bottom: 0.5rem;
	}

	.comment-meta time {
		color: var(--color-ink-muted);
	}

	.muted {
		color: var(--color-ink-muted);
		text-decoration: none;
	}

	.muted:hover {
		color: var(--color-ink);
	}

	.comment-body {
		font-size: 0.9375rem;
		color: var(--color-ink);
		white-space: pre-wrap;
		margin-bottom: 0.75rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.actions button:hover {
		color: var(--color-ink);
	}

	.actions button.ok:hover {
		color: #22c55e;
		border-color: #22c55e;
	}

	.actions button.bad:hover {
		color: #ef4444;
		border-color: #ef4444;
	}

	.more-btn {
		display: block;
		margin: 1.25rem auto 0;
		padding: 0.5rem 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-strong);
		font-size: 0.8125rem;
		cursor: pointer;
	}
</style>
