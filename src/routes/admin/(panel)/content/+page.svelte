<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const EXAMPLE = JSON.stringify(
		[
			{ key: 'title', kind: 'text', required: true, max: 80 },
			{ key: 'body', kind: 'markdown' },
			{ key: 'cover', kind: 'media' },
			{ key: 'tags', kind: 'repeater' }
		],
		null,
		1
	);

	let openNew = $state(false);
	let errors = $derived((page.form as { errors?: string[] } | null)?.errors ?? []);
	let okMsg = $derived((page.form as { ok?: boolean; slug?: string } | null)?.ok ? '已儲存' : '');

	function quickFields(el: HTMLButtonElement) {
		const form = el.closest('form');
		const ta = form?.querySelector('textarea[name=fields]') as HTMLTextAreaElement | null;
		if (ta && !ta.value.trim()) ta.value = EXAMPLE;
	}
</script>

<div class="title">內容型別</div>
<p class="note">
	動態型別＝DB manifest（79b）：欄位 schema 驅動後台表單與驗證，條目存通用 content_items。
	目前公開路由尚未接線（79d portfolio 起）；內建 posts/pages/series 編輯器不受影響。
</p>

{#if errors.length}
	<ul class="errs">
		{#each errors as e (e)}<li>{e}</li>{/each}
	</ul>
{/if}
{#if okMsg}<p class="note ok-line">{okMsg}</p>{/if}

<table class="panel">
	<thead>
		<tr
			><th>key</th><th>名稱</th><th>標題欄</th><th>欄位數</th><th>條目</th><th>狀態</th><th
			></th></tr
		>
	</thead>
	<tbody>
		{#each data.types as t (t.key)}
			<tr>
				<td><code>{t.key}</code></td>
				<td>{t.label}</td>
				<td><code>{t.titleField}</code></td>
				<td>{t.fieldsCount}</td>
				<td>{data.counts[t.key] ?? 0}</td>
				<td>{t.enabled ? '啟用' : '停用'}</td>
				<td class="acts">
					<a class="mini" href={`/admin/content/${t.key}`}>管理條目</a>
					<form
						method="POST"
						action="?/delete"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								await invalidateAll();
							};
						}}
					>
						<input type="hidden" name="key" value={t.key} />
						<button type="submit" class="mini danger">刪除</button>
					</form>
				</td>
			</tr>
		{:else}
			<tr><td colspan="7" class="muted">尚無動態型別——用下方表單或等 79c 的 AI 建立。</td></tr>
		{/each}
	</tbody>
</table>

<button type="button" class="primary" onclick={() => (openNew = !openNew)}>
	{openNew ? '收起來' : '＋ 新建型別'}
</button>

{#if openNew}
	<form
		class="panel create"
		method="POST"
		action="?/save"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				if (!page.form?.errors) {
					openNew = false;
					await invalidateAll();
				}
			};
		}}
	>
		<div class="row">
			<label class="field grow">
				<span class="label">key（小寫英數連字號，2–31 字；公開路由將用 /key/slug）</span>
				<input name="key" required placeholder="portfolio" />
			</label>
			<label class="field grow">
				<span class="label">顯示名</span>
				<input name="label" required placeholder="作品集" />
			</label>
			<label class="field">
				<span class="label">標題欄位</span>
				<input name="titleField" value="title" />
			</label>
		</div>
		<label class="field">
			<span class="label">fields（JSON 陣列：key/kind/required/max/options）</span>
			<textarea name="fields" rows="10" placeholder={EXAMPLE}></textarea>
		</label>
		<div class="row foot">
			<button type="button" class="mini" onclick={(e) => quickFields(e.currentTarget)}
				>填入範例</button
			>
			<button type="submit" class="primary">建立／更新</button>
		</div>
	</form>
{/if}

<style>
	.errs {
		color: var(--color-accent);
		font-size: 0.8125rem;
	}
	.ok-line {
		color: var(--color-ink);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 1rem 0 1.5rem;
		font-size: 0.8125rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--color-line);
	}
	.acts {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.acts form {
		display: inline;
	}
	.create {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 1rem;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		align-items: end;
		flex-wrap: wrap;
	}
	.grow {
		flex: 1;
		min-width: 10rem;
	}
	.foot {
		justify-content: space-between;
	}
	.danger {
		color: var(--color-accent);
	}
</style>
