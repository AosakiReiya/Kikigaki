<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import DynamicField from '$lib/components/DynamicField.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Item = PageData['items'][number];

	let editing = $state<Item | null>(null);
	let showForm = $state(false);
	let errors = $derived((page.form as { errors?: string[] } | null)?.errors ?? []);

	function fieldVal(item: Item | null, key: string): string | boolean | string[] {
		if (!item) return '';
		const v = item.data[key];
		return typeof v === 'boolean' || Array.isArray(v) ? v : typeof v === 'string' ? v : '';
	}

	// the edit form's editing state (deep $state; explicitly rebuilt on startX to avoid derived+$bindable collisions)
	let form = $state<Record<string, string | boolean | string[]>>({});
	function resetForm(item: Item | null) {
		const o: Record<string, string | boolean | string[]> = {};
		for (const f of data.fields) o[f.key] = fieldVal(item, f.key);
		form = o;
	}
	function startNew() {
		editing = null;
		resetForm(null);
		showForm = true;
	}
	function startEdit(item: Item) {
		editing = item;
		resetForm(item);
		showForm = true;
	}
</script>

<a class="mini" href="/admin/content">← 型別列表</a>
<div class="title">
	{data.label} <span class="muted">（{data.typeKey}）</span>
	<a class="mini" href="/{data.typeKey}" target="_blank" rel="noopener">公開頁 ↗</a>
</div>

{#if errors.length}
	<ul class="errs">
		{#each errors as e (e)}<li>{e}</li>{/each}
	</ul>
{/if}

<button type="button" class="primary" onclick={startNew}>＋ 新增條目</button>

{#if showForm}
	<form
		class="panel form"
		id="item-form"
		method="POST"
		action="?/save"
		use:enhance={() => {
			return async ({ update }) => {
				await update();
				if (!page.form?.errors) {
					showForm = false;
					editing = null;
					await invalidateAll();
				}
			};
		}}
	>
		<input type="hidden" name="id" value={editing?.id ?? ''} />
		<div class="row">
			<label class="field grow">
				<span class="label">slug（留空＝由標題生成）</span>
				<input name="slug" value={editing?.slug ?? ''} placeholder="auto" />
			</label>
			<label class="field">
				<span class="label">排序</span>
				<input name="sortOrder" type="number" value={editing?.sortOrder ?? 0} />
			</label>
			<label class="check">
				<input type="checkbox" name="published" checked={editing ? editing.published : true} />
				<span class="label">發布</span>
			</label>
		</div>
		{#each data.fields as f (f.key)}
			<DynamicField field={f} bind:value={form[f.key]} />
		{/each}
		<div class="row foot">
			<button type="button" class="mini" onclick={() => ((showForm = false), (editing = null))}
				>取消</button
			>
			<button type="submit" class="primary">{editing ? '儲存變更' : '建立條目'}</button>
		</div>
	</form>
{/if}

<table class="panel">
	<thead>
		<tr>
			<th>{data.titleField}</th>
			<th>slug</th>
			<th>狀態</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each data.items as item (item.id)}
			<tr>
				<td>{String(item.data[data.titleField] ?? '(無標題)')}</td>
				<td><code>{item.slug}</code></td>
				<td>{item.published ? '已發布' : '草稿'}</td>
				<td class="acts">
					<a class="mini" href="/{data.typeKey}/{item.slug}" target="_blank" rel="noopener">開 ↗</a>
					<button type="button" class="mini" onclick={() => startEdit(item)}>編輯</button>
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
						<input type="hidden" name="id" value={item.id} />
						<button type="submit" class="mini danger">刪除</button>
					</form>
				</td>
			</tr>
		{:else}
			<tr><td colspan="4" class="muted">尚無條目。</td></tr>
		{/each}
	</tbody>
</table>

{#if data.pages > 1}
	<div class="pager">
		{#if data.page > 1}<a class="mini" href={`/admin/content/${data.typeKey}?page=${data.page - 1}`}
				>← 上一頁</a
			>{/if}
		<span class="label">{data.page} / {data.pages}</span>
		{#if data.page < data.pages}<a
				class="mini"
				href={`/admin/content/${data.typeKey}?page=${data.page + 1}`}>下一頁 →</a
			>{/if}
	</div>
{/if}

<style>
	.errs {
		color: var(--color-accent);
		font-size: 0.8125rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 1rem;
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
	}
	.acts form {
		display: inline;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 1rem 0;
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
		min-width: 12rem;
	}
	.foot {
		justify-content: space-between;
	}
	.check {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}
	.pager {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.75rem;
	}
	.danger {
		color: var(--color-accent);
	}
	.muted {
		color: var(--color-ink-muted);
	}
</style>
