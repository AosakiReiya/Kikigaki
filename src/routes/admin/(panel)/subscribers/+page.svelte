<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let addEmail = $state('');
	let sendSlug = $state('');
	const statusLabel: Record<string, string> = {
		pending: '待確認',
		active: '生效',
		unsubscribed: '已退訂'
	};
	const fmt = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');
</script>

<h1 class="title">電子報訂閱者</h1>
<p class="note">
	Double opt-in：勾選訂閱先寄確認信，點連結才生效。每封電子報自動帶一鍵退訂連結。
	<a class="ghost" href="/admin/settings">← Email 設定</a>
</p>

<div class="counts">
	<span class="pill"><b>{data.counts.active}</b> 生效</span>
	<span class="pill"><b>{data.counts.pending}</b> 待確認</span>
	<span class="pill"><b>{data.counts.unsubscribed}</b> 已退訂</span>
</div>

<div class="panels">
	<form class="panel" method="POST" action="?/send" use:enhance>
		<h2>發送電子報</h2>
		<p class="note">選一篇已發布文章，用 newsletter 範本發給全部生效訂閱者（單次上限 200）。</p>
		<select name="postSlug" bind:value={sendSlug}>
			<option value="">— 選擇文章 —</option>
			{#each data.postOptions as po (po.slug)}
				<option value={po.slug}>{po.title}</option>
			{/each}
		</select>
		<button class="primary" type="submit" disabled={!sendSlug}>發送</button>
	</form>

	<form class="panel" method="POST" action="?/add" use:enhance>
		<h2>手動加入</h2>
		<p class="note">輸入地址後一樣會寄確認信（不會直接生效）。</p>
		<input
			type="email"
			name="email"
			bind:value={addEmail}
			placeholder="reader@example.com"
			required
		/>
		<button class="primary" type="submit" disabled={!addEmail}>加入並寄確認信</button>
	</form>
</div>

{#if form?.message}
	<p class="note msg" role="status">{form.message}</p>
{/if}

{#if !data.dbReady}
	<p class="note">資料庫未配置。</p>
{:else if data.subs.length === 0}
	<p class="note">尚無訂閱者——評論表單的「訂閱新文章」勾選是主要入口。</p>
{:else}
	<table class="subs">
		<thead>
			<tr>
				<th>Email</th>
				<th>名稱</th>
				<th>狀態</th>
				<th>來源</th>
				<th>加入</th>
				<th>確認</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.subs as s (s.id)}
				<tr>
					<td>{s.email}</td>
					<td>{s.name ?? '—'}</td>
					<td>
						<span
							class="badge"
							class:ok={s.status === 'active'}
							class:warn={s.status === 'pending'}
						>
							{statusLabel[s.status] ?? s.status}
						</span>
					</td>
					<td>{s.source}</td>
					<td>{fmt(s.createdAt)}</td>
					<td>{fmt(s.confirmedAt)}</td>
					<td>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="id" value={s.id} />
							<button class="ghost danger" type="submit">移除</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}
	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.msg {
		margin-top: 0.5rem;
		color: var(--color-ink);
		font-weight: 600;
	}
	.ghost {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0.3125rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		background: transparent;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}
	.ghost:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.ghost.danger:hover {
		color: #ef4444;
		border-color: #ef4444;
	}
	.counts {
		display: flex;
		gap: 0.5rem;
		margin: 0.75rem 0;
	}
	.pill {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.25rem 0.75rem;
	}
	.pill b {
		color: var(--color-ink);
	}
	.panels {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	@media (max-width: 767px) {
		.panels {
			grid-template-columns: 1fr;
		}
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		background: var(--color-bg-elevated);
		padding: 1rem 1.25rem;
	}
	.panel h2 {
		margin: 0;
		font-size: 1rem;
	}
	.panel select,
	.panel input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-ink);
		font-size: 0.875rem;
	}
	.primary {
		padding: 0.4375rem 1rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.subs {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}
	.subs th,
	.subs td {
		text-align: left;
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--color-line);
		vertical-align: middle;
	}
	.subs th {
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.8125rem;
	}
	.badge {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		padding: 0.0625rem 0.5rem;
		color: var(--color-ink-muted);
	}
	.badge.ok {
		color: #22c55e;
		border-color: #22c55e;
	}
	.badge.warn {
		color: #f59e0b;
		border-color: #f59e0b;
	}
	@media (max-width: 767px) {
		.subs {
			display: block;
			overflow-x: auto;
		}
	}
</style>
