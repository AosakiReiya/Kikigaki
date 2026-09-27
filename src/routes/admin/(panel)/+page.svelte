<script lang="ts">
	import ExtensionSlot from '$lib/components/ExtensionSlot.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="title">總覽</h1>
<ExtensionSlot name="admin.dashboard" />

{#if !data.dbReady}
	<p class="warn">資料庫未配置（本地開發請先設定 D1 binding）。</p>
{:else}
	<div class="stats">
		<div class="card">
			<p class="num">{data.postCount}</p>
			<p class="label">文章</p>
		</div>
		<div class="card">
			<p class="num">{data.pendingComments}</p>
			<p class="label">待審評論</p>
		</div>
		<div class="card">
			<p class="num">{data.views7d}</p>
			<p class="label">近 7 日訪問</p>
		</div>
	</div>

	<h2 class="sub-title">熱門文章</h2>
	<table class="table">
		<thead>
			<tr>
				<th>標題</th>
				<th class="num-col">瀏覽數</th>
			</tr>
		</thead>
		<tbody>
			{#each data.topPosts as post (post.slug)}
				<tr>
					<td><a href="/admin/posts/{post.slug}">{post.title}</a></td>
					<td class="num-col">{post.views}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 2rem;
	}

	.warn {
		color: var(--color-ink-muted);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 1rem;
		margin-bottom: 3rem;
	}

	.card {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 1.25rem 1.5rem;
		background: var(--color-bg-elevated);
	}

	.num {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-accent);
	}

	.label {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-top: 0.25rem;
	}

	.sub-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 1rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}

	.table th,
	.table td {
		text-align: left;
		padding: 0.75rem 0.5rem;
		border-bottom: 1px solid var(--color-line);
	}

	.table th {
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.8125rem;
	}

	.table a {
		color: var(--color-ink);
		text-decoration: none;
	}

	.table a:hover {
		text-decoration: underline;
	}

	.num-col {
		width: 6rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
