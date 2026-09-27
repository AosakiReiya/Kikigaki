<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let msg = $state('');
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editSort = $state(0);
	let expandingId = $state<string | null>(null);
	let draftNames = $state<Record<string, string>>({});
	let savingTr = $state(false);
	let newSlug = $state('');
	let newName = $state('');
	let busy = $state(false);

	const total = $derived(data.categories.reduce((acc, c) => acc + c.count, 0));
	const LOCALE_LABEL: Record<string, string> = { 'zh-cn': '简体', en: 'English', jp: '日本語' };

	type ActionResult = { type?: string; message?: string; data?: { message?: string } } | null;

	async function post(action: string, fd: FormData, verb: string): Promise<boolean> {
		busy = true;
		try {
			const res = await fetch(`/admin/categories?/${action}`, { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as ActionResult;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				msg = `${verb}失敗：${j?.data?.message ?? j?.message ?? res.status}`;
				return false;
			}
			msg = j?.message ?? `✓ 已${verb}`;
			await invalidateAll();
			return true;
		} finally {
			busy = false;
		}
	}

	async function submitCreate() {
		const fd = new FormData();
		fd.set('slug', newSlug);
		fd.set('name', newName);
		if (await post('create', fd, '建立')) {
			newSlug = '';
			newName = '';
		}
	}

	async function submitEdit(id: string) {
		const fd = new FormData();
		fd.set('id', id);
		fd.set('name', editName);
		fd.set('sort', String(editSort));
		if (await post('update', fd, '更新')) editingId = null;
	}

	async function submitTranslations(id: string) {
		savingTr = true;
		const fd = new FormData();
		fd.set('id', id);
		for (const loc of data.translatable) fd.set(`name:${loc}`, draftNames[loc] ?? '');
		const ok = await post('saveTranslations', fd, '儲存');
		savingTr = false;
		if (ok) expandingId = null;
	}

	async function submitRemove(id: string, name: string) {
		if (!confirm(`確定刪除分類「${name}」？文章需已全部改分配。`)) return;
		const fd = new FormData();
		fd.set('id', id);
		await post('remove', fd, '刪除');
	}

	function openTranslations(id: string, names: Record<string, string>) {
		expandingId = id;
		draftNames = { ...names };
	}
</script>

<svelte:head>
	<title>分類 — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">分類</h1>
	<span class="count">共 {data.categories.length} 個分類／{total} 次使用</span>
</div>
<p class="note">
	分類是文章的頂層歸屬（一類一篇），不同於標籤（多對多）。slug
	是網址識別（/blog?type=…），建立後不可改； 基準名與各語系顯示名可隨時調整（●／○
	為翻譯狀態，點擊編輯）。有文章引用的分類不可刪除；article 為內建預設。
</p>

{#if msg}<p class="msg">{msg}</p>{/if}

<form
	class="create"
	onsubmit={(e) => {
		e.preventDefault();
		void submitCreate();
	}}
>
	<input class="slug-input" placeholder="slug（英數連字號）" maxlength="40" bind:value={newSlug} />
	<input placeholder="基準名（繁中）" maxlength="40" bind:value={newName} />
	<button
		type="submit"
		class="ghost primary-text"
		disabled={busy || !newSlug.trim() || !newName.trim()}
	>
		新增分類
	</button>
</form>

{#if !data.dbReady || data.categories.length === 0}
	<p class="empty">還沒有任何分類。</p>
{:else}
	<table class="table">
		<thead>
			<tr>
				<th>基準名</th>
				<th>slug</th>
				<th class="num-col">排序</th>
				<th class="num-col">文章數</th>
				<th>操作</th>
			</tr>
		</thead>
		<tbody>
			{#each data.categories as c (c.id)}
				<tr>
					<td>
						{#if editingId === c.id}
							<input class="rename-input" type="text" maxlength="40" bind:value={editName} />
						{:else}
							{c.name}
							{#if c.protected}<span class="badge">內建</span>{/if}
							<button
								type="button"
								class="tr-toggle"
								title="語系顯示名"
								onclick={() =>
									expandingId === c.id ? (expandingId = null) : openTranslations(c.id, c.names)}
							>
								{Object.keys(c.names).length > 0 ? '●' : '○'}
							</button>
						{/if}
					</td>
					<td class="slug-cell">{c.slug}</td>
					<td class="num-col">
						{#if editingId === c.id}
							<input class="sort-input" type="number" bind:value={editSort} />
						{:else}
							{c.sort}
						{/if}
					</td>
					<td class="num-col">{c.count}</td>
					<td class="actions-cell">
						{#if editingId === c.id}
							<button type="button" class="ghost" onclick={() => void submitEdit(c.id)}>儲存</button
							>
							<button type="button" class="ghost" onclick={() => (editingId = null)}>取消</button>
						{:else}
							<button
								type="button"
								class="ghost"
								onclick={() => {
									editingId = c.id;
									editName = c.name;
									editSort = c.sort;
								}}>編輯</button
							>
							{#if !c.protected}
								<button
									type="button"
									class="ghost danger-text"
									disabled={c.count > 0}
									title={c.count > 0 ? '仍有文章使用' : ''}
									onclick={() => void submitRemove(c.id, c.name)}>刪除</button
								>
							{/if}
						{/if}
					</td>
				</tr>
				{#if expandingId === c.id}
					<tr class="tr-row">
						<td colspan="5">
							<div class="tr-grid">
								{#each data.translatable as loc (loc)}
									<label class="tr-field">
										<span>{LOCALE_LABEL[loc] ?? loc}</span>
										<input
											type="text"
											maxlength="40"
											placeholder={c.name}
											value={draftNames[loc] ?? ''}
											oninput={(e) => (draftNames[loc] = e.currentTarget.value)}
										/>
									</label>
								{/each}
							</div>
							<p class="tr-hint">留空或與基準名相同＝顯示時退回「{c.name}」。</p>
							<div class="tr-actions">
								<button
									type="button"
									class="ghost primary-text"
									disabled={savingTr}
									onclick={() => void submitTranslations(c.id)}>儲存翻譯</button
								>
								<button type="button" class="ghost" onclick={() => (expandingId = null)}
									>收起</button
								>
							</div>
						</td>
					</tr>
				{/if}
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
		font-variant-numeric: tabular-nums;
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

	.ghost:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.danger-text {
		color: #dc2626;
	}

	.primary-text {
		color: var(--color-strong);
		font-weight: 600;
	}

	.badge {
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0 0.4rem;
		margin-left: 0.35rem;
		vertical-align: 0.0625rem;
	}

	.rename-input,
	.sort-input {
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
	}

	.sort-input {
		width: 4.5rem;
		text-align: right;
	}

	.tr-toggle {
		border: none;
		background: none;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0 0.3rem;
		color: var(--color-strong);
	}

	.tr-row td {
		background: color-mix(in oklab, var(--color-ink) 3%, transparent);
	}

	.tr-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem;
		padding: 0.75rem 0;
	}

	.tr-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.tr-field input {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
	}

	.tr-hint {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-bottom: 0.5rem;
	}

	.tr-actions {
		display: flex;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
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
