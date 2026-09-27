<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let msg = $state('');
	/* * tag id whose translation editor is expanded */
	let expandingId = $state<string | null>(null);
	/* * locale → input value */
	let draftNames = $state<Record<string, string>>({});
	let savingTr = $state(false);

	const total = $derived(data.tags.reduce((acc, t) => acc + t.count, 0));
	const LOCALE_LABEL: Record<string, string> = { 'zh-cn': '简体', en: 'English', jp: '日本語' };

	function openTranslations(id: string, names: Record<string, string>) {
		expandingId = id;
		draftNames = { ...names };
	}

	async function submitTranslations(id: string) {
		savingTr = true;
		const fd = new FormData();
		fd.set('id', id);
		for (const loc of data.translatable) fd.set(`name:${loc}`, draftNames[loc] ?? '');
		try {
			const res = await fetch('/admin/tags?/saveTranslations', { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				message?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
				msg = `儲存失敗：${j?.data?.message ?? j?.message ?? res.status}`;
			} else {
				msg = j?.message ?? '✓ 已儲存';
				expandingId = null;
				await invalidateAll();
			}
		} finally {
			savingTr = false;
		}
	}

	async function submitRename(id: string) {
		const tag = data.tags.find((t) => t.id === id);
		if (!tag) return;
		const name = renameValue.trim();
		if (!name) {
			msg = '名稱不能為空';
			return;
		}
		if (name === tag.name) {
			renamingId = null;
			msg = '';
			return;
		}
		const fd = new FormData();
		fd.set('id', id);
		fd.set('name', name);
		const res = await fetch('/admin/tags?/rename', { method: 'POST', body: fd });
		const j = (await res.json().catch(() => null)) as {
			type?: string;
			message?: string;
			data?: { message?: string };
		} | null;
		if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
			msg = `改名失敗：${j?.data?.message ?? j?.message ?? res.status}`;
		} else {
			msg = j?.message ?? '✓ 已改名';
			renamingId = null;
			await invalidateAll();
		}
	}

	async function deleteTag(id: string, name: string) {
		if (!confirm(`確定刪除標籤「${name}」？只移除標籤連結，文章不受影響。`)) return;
		const fd = new FormData();
		fd.set('id', id);
		const res = await fetch('/admin/tags?/remove', { method: 'POST', body: fd });
		const j = (await res.json().catch(() => null)) as {
			type?: string;
			message?: string;
			data?: { message?: string };
		} | null;
		if (!res.ok || j?.type === 'error' || j?.type === 'failure') {
			msg = `刪除失敗：${j?.data?.message ?? j?.message ?? res.status}`;
		} else {
			msg = j?.message ?? '✓ 已刪除';
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>標籤 — Admin</title>
</svelte:head>

<div class="head">
	<h1 class="title">標籤</h1>
	<span class="count">共 {data.tags.length} 個標籤／{total} 次使用</span>
</div>
<p class="note">
	重新命名會同步更新網址（slug）；刪除只移除連結，文章本身不受影響。新的標籤可在文章編輯器新增。名稱旁的
	●／○ 為語系翻譯狀態，點擊可編輯各語系顯示名。
</p>

{#if msg}<p class="msg">{msg}</p>{/if}

{#if !data.dbReady || data.tags.length === 0}
	<p class="empty">還沒有任何標籤。</p>
{:else}
	<table class="table">
		<thead>
			<tr>
				<th>名稱</th>
				<th>slug</th>
				<th class="num-col">文章數</th>
				<th>操作</th>
			</tr>
		</thead>
		<tbody>
			{#each data.tags as tag (tag.id)}
				<tr>
					<td>
						{#if renamingId === tag.id}
							<input
								class="rename-input"
								type="text"
								maxlength="40"
								bind:value={renameValue}
								onkeydown={(e) => {
									if (e.key === 'Enter') void submitRename(tag.id);
									if (e.key === 'Escape') renamingId = null;
								}}
								autofocus
							/>
						{:else}
							{tag.name}
							<button
								type="button"
								class="tr-toggle"
								title="語系顯示名"
								onclick={() =>
									expandingId === tag.id
										? (expandingId = null)
										: openTranslations(tag.id, tag.names)}
							>
								{Object.keys(tag.names).length > 0 ? '●' : '○'}
							</button>
						{/if}
					</td>
					<td class="slug-cell">/{tag.slug}</td>
					<td class="num-col">{tag.count}</td>
					<td class="actions-cell">
						{#if renamingId === tag.id}
							<button type="button" class="ghost" onclick={() => void submitRename(tag.id)}
								>儲存</button
							>
							<button type="button" class="ghost" onclick={() => (renamingId = null)}>取消</button>
						{:else}
							<button
								type="button"
								class="ghost"
								onclick={() => {
									renamingId = tag.id;
									renameValue = tag.name;
								}}>改名</button
							>
							<button
								type="button"
								class="ghost danger-text"
								onclick={() => void deleteTag(tag.id, tag.name)}>刪除</button
							>
						{/if}
					</td>
				</tr>
				{#if expandingId === tag.id}
					<tr class="tr-row">
						<td colspan="4">
							<div class="tr-grid">
								{#each data.translatable as loc (loc)}
									<label class="tr-field">
										<span>{LOCALE_LABEL[loc] ?? loc}</span>
										<input
											type="text"
											maxlength="40"
											placeholder={tag.name}
											value={draftNames[loc] ?? ''}
											oninput={(e) => (draftNames[loc] = e.currentTarget.value)}
										/>
									</label>
								{/each}
							</div>
							<p class="tr-hint">留空或與基準名相同＝顯示時退回「{tag.name}」。</p>
							<div class="tr-actions">
								<button
									type="button"
									class="ghost primary-text"
									disabled={savingTr}
									onclick={() => void submitTranslations(tag.id)}>儲存翻譯</button
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
		margin-bottom: 2rem;
	}

	.msg {
		font-size: 0.875rem;
		margin-bottom: 1rem;
		color: var(--color-ink);
	}

	.empty {
		color: var(--color-ink-muted);
		padding: 2rem 0;
	}

	.table {
		width: 100%;
		max-width: 48rem;
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

	.num-col {
		width: 5rem;
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

	.danger-text {
		color: var(--color-danger, #e5484d);
	}

	.ghost.danger-text:hover {
		color: #ef4444;
		border-color: #dc2626;
	}

	.rename-input {
		padding: 0.3125rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		background: var(--color-bg);
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
		width: 14rem;
	}

	.rename-input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.tr-toggle {
		appearance: none;
		background: none;
		border: none;
		color: var(--color-accent);
		font-size: 0.625rem;
		cursor: pointer;
		padding: 0 0.25rem;
		vertical-align: 0.0625rem;
	}

	.tr-row td {
		border-bottom: 1px solid var(--color-line);
		padding-top: 0;
	}

	.tr-grid {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.tr-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.tr-field input {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		background: var(--color-bg);
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
		width: 12rem;
	}

	.tr-field input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.tr-hint {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin: 0.625rem 0 0.5rem;
	}

	.tr-actions {
		display: flex;
		gap: 0.5rem;
	}

	.primary-text {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
</style>
