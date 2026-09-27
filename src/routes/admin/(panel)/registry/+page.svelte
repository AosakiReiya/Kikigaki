<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate } from '$lib/format';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: { message?: string } | null } = $props();

	let openVersions = $state<string | null>(null);

	const groups = $derived([
		{ kind: 'theme', label: '主題（目錄）', items: data.items.filter((i) => i.kind === 'theme') },
		{
			kind: 'plugin',
			label: '外掛（事件鉤子）',
			items: data.items.filter((i) => i.kind === 'plugin')
		},
		{
			kind: 'component',
			label: '元件（::: 內容元件）',
			items: data.items.filter((i) => i.kind === 'component')
		}
	] as const);

	const srcChip: Record<string, string> = {
		official: '官方',
		private: '本站',
		ai: 'AI 生成',
		community: '社群',
		github: 'GitHub'
	};
</script>

<svelte:head>
	<title>Registry — Admin</title>
</svelte:head>

<h1 class="title">Registry</h1>
<p class="note">
	統一安裝目錄：主題／外掛／元件的生命週期——版本歷史、回滾、啟用閘、來源與權限審查。 AI
	來源預設「待審」，批准後才會對外服務；官方項目不可卸載但可停用。
</p>
{#if form?.message}<p class="msg">{form.message}</p>{/if}

<details class="ext-install">
	<summary>安裝擴展（manifest JSON）</summary>
	<form
		method="POST"
		action="?/installExt"
		use:enhance={() =>
			({ update }) =>
				update()}
	>
		<textarea
			name="manifest"
			rows="10"
			placeholder={'{"id":"my-ext","name":"My Extension","version":"1.0.0","contentTypes":[…],"components":[…],"slots":{"post.after":["my-card"]},"settings":{…}}'}
		></textarea>
		<p class="note">
			一個 JSON 包住：內容型別（create-only，不覆寫既有）、元件（workshop
			原始碼）、槽位指派、設定預設。 AI 來源自動待審。型別資料在卸載後保留。
		</p>
		<button type="submit" class="primary">安裝</button>
	</form>
</details>

{#if !data.dbReady}
	<p class="note">資料庫未配置。</p>
{:else}
	{#each groups as g (g.kind)}
		<section class="grp">
			<h2 class="grp-title">{g.label} <span class="cnt">{g.items.length}</span></h2>
			<table class="table">
				<thead>
					<tr>
						<th>項目</th>
						<th>來源</th>
						<th>版本</th>
						<th>審查</th>
						<th>狀態</th>
						<th>更新</th>
						<th>操作</th>
					</tr>
				</thead>
				<tbody>
					{#each g.items as it (it.id)}
						<tr class:dim={!it.enabled}>
							<td>
								<span class="nm">{it.name}</span>
								<span class="slug mono">{it.slug}</span>
								{#if it.capabilities.length > 0}
									<span class="caps">
										{#each it.capabilities as c (c)}<span class="chip">{c}</span>{/each}
									</span>
								{/if}
							</td>
							<td><span class="chip src-{it.source}">{srcChip[it.source] ?? it.source}</span></td>
							<td class="mono">
								v{it.version}
								<button
									type="button"
									class="mini ver"
									onclick={() => (openVersions = openVersions === it.id ? null : it.id)}
									>歷史</button
								>
							</td>
							<td>
								{#if it.review === 'approved'}
									<span class="chip ok">已批准</span>
									{#if it.source !== 'official'}
										<form
											method="POST"
											action="?/review"
											use:enhance={() =>
												({ update }) =>
													update()}
										>
											<input type="hidden" name="id" value={it.id} />
											<input type="hidden" name="review" value="pending" />
											<button type="submit" class="mini">退回</button>
										</form>
									{/if}
								{:else}
									<span class="chip warn">待審</span>
									<form
										method="POST"
										action="?/review"
										use:enhance={() =>
											({ update }) =>
												update()}
									>
										<input type="hidden" name="id" value={it.id} />
										<input type="hidden" name="review" value="approved" />
										<button type="submit" class="primary approve">批准</button>
									</form>
								{/if}
							</td>
							<td>
								<form
									method="POST"
									action="?/toggle"
									use:enhance={() =>
										({ update }) =>
											update()}
								>
									<input type="hidden" name="id" value={it.id} />
									<input type="hidden" name="enabled" value={it.enabled ? '' : 'on'} />
									<button type="submit" class="mini">{it.enabled ? '停用' : '啟用'}</button>
								</form>
							</td>
							<td class="mono">{formatDate(new Date(it.updatedAt).toISOString().slice(0, 10))}</td>
							<td class="ops">
								{#if it.kind === 'plugin' && it.source !== 'official'}
									<form
										method="POST"
										action="?/uninstallExt"
										use:enhance={() =>
											({ update }) =>
												update()}
									>
										<input type="hidden" name="slug" value={it.slug} />
										<button
											type="submit"
											class="mini danger"
											onclick={(e) => {
												if (
													!confirm(`卸載擴展「${it.name}」？槽位與元件移除；內容型別與資料保留。`)
												)
													e.preventDefault();
											}}>卸載</button
										>
									</form>
								{:else if it.source !== 'official'}
									<form
										method="POST"
										action="?/uninstall"
										use:enhance={() =>
											({ update }) =>
												update()}
									>
										<input type="hidden" name="id" value={it.id} />
										<button
											type="submit"
											class="mini danger"
											onclick={(e) => {
												if (!confirm(`卸載「${it.name}」？版本歷史一併刪除。`)) e.preventDefault();
											}}>卸載</button
										>
									</form>
								{/if}
							</td>
						</tr>
						{#if openVersions === it.id}
							<tr class="hist">
								<td colspan="7">
									{#each data.versionsByItem[it.id] ?? [] as v (v.version)}
										<div class="vrow">
											<span class="mono">v{v.version}</span>
											<span class="vn">{v.note}</span>
											<span class="mono dim2"
												>{formatDate(new Date(v.createdAt).toISOString().slice(0, 10))}</span
											>
											{#if v.version !== it.version}
												<form
													method="POST"
													action="?/rollback"
													use:enhance={() =>
														({ update }) =>
															update()}
												>
													<input type="hidden" name="id" value={it.id} />
													<input type="hidden" name="version" value={v.version} />
													<button type="submit" class="mini">回滾至此</button>
												</form>
											{:else}
												<span class="chip ok">目前</span>
											{/if}
										</div>
									{/each}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</section>
	{/each}
{/if}

<style>
	.ext-install {
		margin: 0.8rem 0 1.2rem;
		border: 1px solid var(--color-line);
		padding: 0.6rem 0.9rem;
	}
	.ext-install summary {
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
	}
	.ext-install textarea {
		width: 100%;
		margin-top: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		color: var(--color-ink);
		padding: 0.5rem;
	}
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}
	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1.25rem;
		line-height: 1.7;
		max-width: 60rem;
	}
	.msg {
		font-size: 0.82rem;
		color: var(--color-strong);
		margin-bottom: 0.75rem;
	}
	.grp {
		margin-bottom: 2rem;
	}
	.grp-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}
	.cnt {
		color: var(--color-ink-muted);
		font-weight: 400;
		font-size: 0.85rem;
	}
	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.83rem;
	}
	.table th {
		text-align: left;
		color: var(--color-ink-muted);
		font-weight: 500;
		font-size: 0.72rem;
		border-bottom: 1px solid var(--color-line);
		padding: 0.35rem 0.5rem;
	}
	.table td {
		border-bottom: 1px solid var(--color-line);
		padding: 0.45rem 0.5rem;
		vertical-align: middle;
	}
	tr.dim {
		opacity: 0.45;
	}
	.nm {
		font-weight: 600;
		margin-right: 0.4rem;
	}
	.slug {
		color: var(--color-ink-muted);
		font-size: 0.75rem;
	}
	.mono {
		font-family: var(--font-mono);
	}
	.caps {
		display: inline-flex;
		gap: 0.25rem;
		margin-left: 0.5rem;
	}
	.chip {
		display: inline-block;
		font-size: 0.68rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0.03rem 0.45rem;
		color: var(--color-ink-muted);
	}
	.chip.ok {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}
	.chip.warn {
		border-color: #d9822b;
		color: #d9822b;
	}
	.chip.src-official {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}
	.chip.src-ai {
		border-color: #7c6cff;
		color: #7c6cff;
	}
	.mini {
		font-size: 0.72rem;
		padding: 0.12rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.mini.danger:hover {
		border-color: #e5484d;
		color: #e5484d;
	}
	.ver {
		margin-left: 0.35rem;
	}
	form {
		display: inline;
	}
	.ops form {
		display: inline-block;
	}
	.primary {
		font-size: 0.72rem;
		padding: 0.15rem 0.6rem;
		border-radius: 6px;
		border: none;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		cursor: pointer;
	}
	.approve {
		margin-left: 0.35rem;
	}
	tr.hist td {
		background: var(--color-bg-elevated);
	}
	.vrow {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.2rem 0;
		font-size: 0.8rem;
	}
	.vn {
		color: var(--color-ink-muted);
	}
	.dim2 {
		color: var(--color-ink-muted);
	}
</style>
