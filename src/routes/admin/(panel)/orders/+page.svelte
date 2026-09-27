<script lang="ts">
	/* * 79e orders overview (read-only; refunds etc. happen in the provider dashboard). */
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const money = (c: number, cur: string) =>
		cur === 'jpy' || cur === 'twd'
			? `${cur.toUpperCase()} ${c}`
			: `${cur.toUpperCase()} ${(c / 100).toFixed(2)}`;
	const when = (d: Date) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—');
</script>

<div class="title">訂單 <a class="mini" href="/admin/orders/export.csv">CSV 匯出 ↓</a></div>
<p class="note">數位商品訂單（79e）。交付憑證於付款回寫時自動簽發，90 天有效。</p>

<table class="panel">
	<thead>
		<tr
			><th>時間</th><th>狀態</th><th>類型</th><th>金額</th><th>項目</th><th>email</th><th
				>provider</th
			></tr
		>
	</thead>
	<tbody>
		{#each data.orders as o (o.id)}
			<tr>
				<td>{when(o.createdAt)}</td>
				<td><span class="st st-{o.status}">{o.status}</span></td>
				<td class="mut" title={o.message}>{o.kind === 'tip' ? '☕ tip' : 'goods'}</td>
				<td>{money(o.totalCents, o.currency)}</td>
				<td>{o.itemCount}</td>
				<td class="mut">{o.email || '—'}</td>
				<td class="mut">{o.provider}</td>
			</tr>
		{:else}
			<tr><td colspan="7" class="mut">尚無訂單。</td></tr>
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		margin-top: 1rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--color-line);
	}
	.mut {
		color: var(--color-ink-muted);
	}
	.st {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-line);
	}
	.st-paid {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.st-failed,
	.st-refunded {
		opacity: 0.6;
	}
</style>
