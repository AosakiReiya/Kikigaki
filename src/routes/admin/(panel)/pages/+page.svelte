<script lang="ts">
	import { formatDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: { message?: string } | null } = $props();

	let newSlug = $state('');
	let newTitle = $state('');
</script>

<svelte:head>
	<title>頁面 — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">頁面</h1>
</div>
<p class="note">
	獨立於文章的自訂 Markdown 頁（裸路徑 <code>/&#123;slug&#125;</code>，無目錄、可塞
	<code>:::</code> 內容元件）。 可選擇顯示於頁首導航 — 頁面清單是資料，渲染權在各主題 pack。
</p>

<form class="create" method="POST" action="?/create">
	<input
		class="in slug"
		name="slug"
		bind:value={newSlug}
		placeholder="slug（小寫英數連字號）"
		required
		maxlength="50"
		pattern="[a-z0-9][a-z0-9\-]*"
	/>
	<input class="in" name="title" bind:value={newTitle} placeholder="頁面標題" required />
	<button type="submit" class="primary">＋ 新建頁面</button>
</form>
{#if form?.message}<p class="form-err">{form.message}</p>{/if}

{#if !data.dbReady}
	<p class="note">資料庫未配置。</p>
{:else}
	<table class="table">
		<thead>
			<tr>
				<th>路徑</th>
				<th>標題</th>
				<th>狀態</th>
				<th>導航</th>
				<th>更新</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.pages as p (p.slug)}
				<tr>
					<td class="mono"><a href="/admin/pages/{p.slug}">/{p.slug}</a></td>
					<td>{p.title || '（未命名）'}</td>
					<td>
						<span class="chip" class:ok={p.published}>{p.published ? '已發布' : '草稿'}</span>
					</td>
					<td class="mono">
						{#if p.showInNav}✓ {p.navOrder || 0}{:else}—{/if}
					</td>
					<td class="mono">{formatDate(new Date(p.updatedAt).toISOString().slice(0, 10))}</td>
					<td class="actions">
						<a class="mini" href="/admin/pages/{p.slug}">編輯</a>
						{#if p.published}<a class="mini" href={`/${p.slug}`} target="_blank">預覽</a>{/if}
						<form method="POST" action="?/delete">
							<input type="hidden" name="slug" value={p.slug} />
							<button
								type="submit"
								class="mini danger"
								onclick={(e) => {
									if (!confirm(`刪除頁面 /${p.slug}？此操作不可還原。`)) e.preventDefault();
								}}>刪除</button
							>
						</form>
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="empty"
						>還沒有自訂頁面 — 用上方表單建立（例：/uses、/guestbook、/links）</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}
	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1rem;
		line-height: 1.7;
	}
	.note code {
		font-family: var(--font-mono);
		background: var(--color-bg-elevated);
		padding: 0.05rem 0.35rem;
		border-radius: 4px;
	}
	.create {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}
	.in {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 6px;
		color: inherit;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
	}
	.slug {
		font-family: var(--font-mono);
		width: 16rem;
	}
	.primary {
		border: none;
		border-radius: 6px;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		padding: 0.4rem 0.9rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.form-err {
		color: #e5484d;
		font-size: 0.8rem;
	}
	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.table th {
		text-align: left;
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.75rem;
		border-bottom: 1px solid var(--color-line);
		padding: 0.4rem 0.5rem;
	}
	.table td {
		border-bottom: 1px solid var(--color-line);
		padding: 0.5rem;
		vertical-align: middle;
	}
	.table a {
		color: inherit;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.chip {
		font-size: 0.7rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		color: var(--color-ink-muted);
	}
	.chip.ok {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.actions form {
		margin: 0;
	}
	.mini {
		font-size: 0.75rem;
		padding: 0.15rem 0.55rem;
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
	.empty {
		text-align: center;
		color: var(--color-ink-muted);
		padding: 2rem 0;
	}
</style>
