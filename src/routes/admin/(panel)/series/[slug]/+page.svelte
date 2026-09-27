<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Switch from '$lib/components/Switch.svelte';
	import MediaPicker from '$lib/components/MediaPicker.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let msg = $state('');
	let busy = $state(false);
	const LOCALE_LABEL: Record<string, string> = { 'zh-cn': '简体', en: 'English', jp: '日本語' };

	let view = $derived(data.view);
	const V = () => data.view as NonNullable<typeof data.view>;
	let title = $state('');
	let summary = $state('');
	let cover = $state('');
	let mediaOpen = $state(false);
	let published = $state(false);
	let trDraft = $state<Record<string, { title: string; summary: string }>>({});
	let addSlug = $state('');
	let moveTargets = $state<Record<string, number>>({});

	$effect(() => {
		const v = data.view;
		if (!v) return;
		title = v.title;
		summary = v.summary;
		cover = v.cover;
		published = v.published;
		trDraft = Object.fromEntries(
			data.translatable.map((l) => [
				l,
				{ title: v.translations[l]?.title ?? '', summary: v.translations[l]?.summary ?? '' }
			])
		);
	});

	async function post(action: string, fd: FormData, verb: string) {
		busy = true;
		try {
			const res = await fetch(`/admin/series/${view ? V().slug : ''}?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { accept: 'application/json' }
			});
			const j = (await res.json().catch(() => null)) as {
				type?: string;
				data?: { message?: string };
			} | null;
			if (!res.ok || j?.type === 'failure') {
				msg = `${verb}失敗：${j?.data?.message ?? res.status}`;
				return false;
			}
			msg = '✓ 已' + verb;
			await invalidateAll();
			return true;
		} finally {
			busy = false;
		}
	}

	function saveBase() {
		const fd = new FormData();
		fd.set('id', V().id);
		fd.set('title', title);
		fd.set('summary', summary);
		fd.set('cover', cover);
		if (published) fd.set('published', 'on');
		return post('update', fd, '更新');
	}

	function saveTr() {
		const fd = new FormData();
		fd.set('id', V().id);
		for (const l of data.translatable) {
			fd.set(`title:${l}`, trDraft[l]?.title ?? '');
			fd.set(`summary:${l}`, trDraft[l]?.summary ?? '');
		}
		return post('saveTranslations', fd, '儲存翻譯');
	}

	function addMember(e: SubmitEvent) {
		e.preventDefault();
		const fd = new FormData();
		fd.set('seriesId', V().id);
		fd.set('postSlug', addSlug);
		void post('addPost', fd, '加入').then((ok) => {
			if (ok) addSlug = '';
		});
	}

	const move = (postId: string, to: number) => {
		const fd = new FormData();
		fd.set('seriesId', V().id);
		fd.set('postId', postId);
		fd.set('to', String(to));
		return post('move', fd, '移動');
	};

	const removeMember = (postId: string, slug: string) => {
		if (!confirm(`把「${slug}」移出系列？`)) return;
		const fd = new FormData();
		fd.set('seriesId', V().id);
		fd.set('postId', postId);
		return post('removePost', fd, '移出');
	};
</script>

<svelte:head>
	<title>系列：{view?.slug ?? ''} — Admin</title>
</svelte:head>

{#if !data.dbReady || !view}
	<p class="note">找不到這個系列。<a href="/admin/series">回到列表</a></p>
{:else}
	<div class="head">
		<h1 class="title">
			<a class="back" href="/admin/series">←</a>
			{view.title}
			<span class="slug">{view.slug}</span>
		</h1>
		<div class="head-right">
			<Switch
				bind:checked={published}
				label={published ? '已發布（前台書架可見）' : '草稿（僅後台）'}
			/>
		</div>
	</div>

	{#if msg}<p class="msg">{msg}</p>{/if}

	<section class="panel">
		<h2>基本資料</h2>
		<div class="grid">
			<label class="f"
				><span>標題（繁中基準）</span><input maxlength="80" bind:value={title} /></label
			>
			<label class="f"
				><span>封面（圖片或 /covers 路徑）</span>
				<div class="cover-row">
					<input placeholder="/media/… 或 /covers/….svg" maxlength="300" bind:value={cover} />
					<button type="button" class="ghost" onclick={() => (mediaOpen = true)}>媒體庫</button>
					{#if cover}<button type="button" class="ghost danger-text" onclick={() => (cover = '')}
							>清除</button
						>{/if}
				</div>
				{#if cover}<img class="cover-thumb" src={cover} alt="封面預覽" />{/if}
			</label>
			<!-- 59G: the orientation feature was removed (archived in the archive/series-orientation branch); bookshelves are always 3:4 -->
			<label class="f wide"
				><span>簡介</span><textarea rows="2" maxlength="500" bind:value={summary}></textarea></label
			>
		</div>
		<button type="button" class="ghost primary-text" disabled={busy} onclick={() => void saveBase()}
			>儲存</button
		>
	</section>

	<section class="panel">
		<h2>語系譯名 <span class="hint">留空且简介同基準＝退回繁中</span></h2>
		{#each data.translatable as l (l)}
			<div class="tr-row">
				<span class="tr-loc">{LOCALE_LABEL[l] ?? l}</span>
				<input
					placeholder={view.title}
					maxlength="80"
					value={trDraft[l]?.title ?? ''}
					oninput={(e) =>
						(trDraft[l] = { ...(trDraft[l] ?? { summary: '' }), title: e.currentTarget.value })}
				/>
				<input
					class="tr-sum"
					placeholder="（選填）該語系簡介"
					maxlength="500"
					value={trDraft[l]?.summary ?? ''}
					oninput={(e) =>
						(trDraft[l] = { ...(trDraft[l] ?? { title: '' }), summary: e.currentTarget.value })}
				/>
			</div>
		{/each}
		<button type="button" class="ghost primary-text" disabled={busy} onclick={() => void saveTr()}
			>儲存翻譯</button
		>
	</section>

	<section class="panel">
		<h2>成員（{view.members.length} 篇・依序）</h2>
		<table class="table">
			<thead>
				<tr>
					<th class="num-col">#</th>
					<th>文章</th>
					<th>狀態</th>
					<th>操作</th>
				</tr>
			</thead>
			<tbody>
				{#each view.members as m (m.postId)}
					<tr>
						<td class="num-col">{m.position}</td>
						<td>
							<span class="m-title">{m.title}</span>
							<span class="m-slug">/blog/{m.slug}</span>
						</td>
						<td>{m.published ? '已發布' : '草稿'}</td>
						<td class="actions-cell">
							<span class="acts">
								<input
									class="move-input"
									type="number"
									min="1"
									max={view.members.length}
									value={moveTargets[m.postId] ?? m.position}
									oninput={(e) => (moveTargets[m.postId] = Number(e.currentTarget.value))}
								/>
								<button
									type="button"
									class="ghost"
									disabled={busy}
									onclick={() => void move(m.postId, moveTargets[m.postId] ?? m.position)}
									>移</button
								>
								<button
									type="button"
									class="ghost danger-text"
									disabled={busy}
									onclick={() => void removeMember(m.postId, m.slug)}>移出</button
								>
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<form class="add" onsubmit={addMember}>
			<Combobox
				options={data.memberCandidates.map((c) => ({
					value: c.slug,
					label: c.title,
					hint: c.hint
				}))}
				bind:value={addSlug}
				placeholder="選擇或輸入文章 slug"
				emptyText="沒有可加入的文章"
			/>
			<button type="submit" class="ghost primary-text" disabled={busy || !addSlug.trim()}
				>加入</button
			>
		</form>
	</section>
{/if}

<MediaPicker
	open={mediaOpen}
	onClose={() => (mediaOpen = false)}
	onPick={({ url }) => {
		cover = url;
		mediaOpen = false;
	}}
/>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.head-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 700;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.back {
		text-decoration: none;
		color: var(--color-ink-muted);
	}

	.slug {
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		font-weight: 400;
	}

	.note,
	.msg {
		font-size: 0.8125rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
	}

	.msg {
		background: color-mix(in oklab, var(--color-accent) 10%, transparent);
		margin-bottom: 0.75rem;
	}

	.panel {
		margin: 1.25rem 0 1.75rem;
		padding: 1rem 1.25rem 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: 0.6rem;
	}

	.panel h2 {
		font-size: 1rem;
		margin: 0 0 0.75rem;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		font-weight: 400;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.f {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.f.wide {
		grid-column: 1 / -1;
	}

	.f input,
	.f textarea {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8125rem;
		color: var(--color-ink);
	}

	.tr-row {
		display: grid;
		grid-template-columns: 5rem 1fr 1.4fr;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		align-items: center;
	}

	.tr-loc {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.tr-row input {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.8125rem;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
		margin-bottom: 0.75rem;
	}

	.table th,
	.table td {
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--color-line);
		vertical-align: middle;
	}

	.num-col {
		text-align: right;
		width: 2.5rem;
		font-family: var(--font-mono);
	}

	.m-title {
		display: block;
	}

	.m-slug {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.actions-cell {
		white-space: nowrap;
	}

	/* flex goes on the inner span: a flex-ified td loses table-cell row-height stretching (the root of the 58.10 misalignment) */
	.acts {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		vertical-align: middle;
	}

	/* 58.10: same-row controls share a height — eliminates the jagged edge */
	.move-input,
	.actions-cell .ghost {
		box-sizing: border-box;
		height: 2.125rem;
	}

	.cover-row {
		display: flex;
		gap: 0.4rem;
	}

	.cover-row input {
		flex: 1;
		min-width: 0;
	}

	.cover-thumb {
		margin-top: 0.5rem;
		width: 8.5rem;
		aspect-ratio: 3 / 4;
		object-fit: cover;
		border: 1px solid var(--color-line);
		border-radius: 0.35rem;
	}

	.seg {
		display: flex;
		gap: 1rem;
		align-items: center;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.move-input {
		width: 3.5rem;
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--color-line);
		border-radius: 0.3rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.8125rem;
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
	}

	.danger-text {
		color: #dc2626;
	}

	.primary-text {
		color: var(--color-strong);
		font-weight: 600;
	}

	.add {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.add input[placeholder] {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
		font-family: var(--font-mono);
	}

	/* canonical focus vocabulary (aligned with the posts page) */
	input:focus,
	textarea:focus,
	select:focus {
		outline: none;
		border-color: var(--color-accent);
	}
</style>
