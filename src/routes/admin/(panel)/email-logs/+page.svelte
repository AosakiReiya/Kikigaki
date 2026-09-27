<script lang="ts">
	let { data } = $props();
	const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
</script>

<h1 class="title">Email 發送紀錄</h1>
<p class="note">最近 100 條。所有範本信與測試信經此表；憑證不會出現在這裡。</p>
<p><a class="ghost" href="/admin/settings">← 返回 Email 設定</a></p>

{#if data.logs.length === 0}
	<p class="note">尚無發送紀錄。</p>
{:else}
	<table class="logs">
		<thead>
			<tr>
				<th>時間</th>
				<th>收件</th>
				<th>範本</th>
				<th>Provider</th>
				<th>主旨</th>
				<th>狀態</th>
				<th>延遲</th>
			</tr>
		</thead>
		<tbody>
			{#each data.logs as log (log.id)}
				<tr>
					<td>{fmt(log.createdAt)}</td>
					<td>{log.to}</td>
					<td>{log.template}</td>
					<td>{log.provider}</td>
					<td title={log.error ?? ''}>{log.subject || '—'}</td>
					<td>
						{#if log.status === 'sent'}
							<span class="badge ok">sent</span>
						{:else}
							<span class="badge bad" title={log.error ?? ''}>failed</span>
						{/if}
					</td>
					<td>{log.latencyMs !== null ? `${log.latencyMs}ms` : '—'}</td>
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
	.ghost {
		display: inline-block;
		margin-top: 0.5rem;
		padding: 0.3125rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}
	.ghost:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.logs {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
		margin-top: 0.75rem;
	}
	.logs th,
	.logs td {
		text-align: left;
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--color-line);
		vertical-align: top;
	}
	.logs th {
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
	}
	.badge.ok {
		color: #22c55e;
		border-color: #22c55e;
	}
	.badge.bad {
		color: #ef4444;
		border-color: #ef4444;
	}
	@media (max-width: 767px) {
		.logs {
			display: block;
			overflow-x: auto;
		}
	}
</style>
