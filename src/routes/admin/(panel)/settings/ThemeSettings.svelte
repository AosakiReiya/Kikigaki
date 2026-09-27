<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { themes, THEME_IDS, themeManifest, type ActiveThemeId } from '$lib/themes';
	import { getThemePreview, setThemePreview } from '$lib/themes/preview.svelte';
	import { isDbTheme, resolveManifest } from '$lib/themes/db-registry.svelte';

	let { current }: { current: string } = $props();

	let busy = $state(false);
	let message = $state('');

	// structure preview = write the preview store: the root layout reactively recomposes the pack (header/home/post swap as a set),
	// persists across pages (sessionStorage), never written to server settings; ends with the preview or the tab
	const preview = $derived(getThemePreview());
	// 78c: db- themes appear as a banner outside the card area (this page only previews/adopts the four built-in themes)
	const currentDb = $derived(isDbTheme(current) ? resolveManifest(current).label : null);
	const serverId = $derived(isDbTheme(current) ? null : themeManifest(current).id);

	function startPreview(id: ActiveThemeId) {
		setThemePreview(id === serverId || preview === id ? null : id);
	}

	async function applyAsTheme(id: ActiveThemeId) {
		busy = true;
		message = '';
		try {
			const fd = new FormData();
			fd.set('id', id);
			const res = await fetch('/admin/settings?/theme', { method: 'POST', body: fd });
			const j = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
			if (!res.ok || j?.type === 'failure' || j?.type === 'error') {
				message = `切換失敗：${j?.message ?? res.status}`;
				return;
			}
			message = `✓ ${j?.message ?? '已切換'}（全站即時生效）`;
			setThemePreview(null);
			// refetch root layout data → serverTheme updates; ending preview locks in the new theme
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<section class="thm">
	<h2 class="thm-title">設計主題</h2>
	{#if currentDb}
		<p class="hint">
			當前主題：<strong>{currentDb}</strong>（DB 主題，在 <a href="/admin/themes">主題工作台</a> 編輯）
		</p>
	{/if}
	<p class="hint">
		主題＝設計令牌（色彩／字型／材質）＋行為 preset（轉場／Preloader／進場節奏）＋版面結構槽
		（頁首／首頁／文章頁／標籤頁）。點卡片即時預覽（整站重組、跨頁維持，不寫入），
		確定後按「設為網站主題」。深浅模式與主題正交、可自由組合。<a href="/admin/themes"
			>DB 主題（免 Git 換肤）→ 主題工作台</a
		>。
	</p>

	<div class="grid">
		{#each THEME_IDS as id (id)}
			{@const t = themes[id]}
			{@const active = serverId === id}
			<article class="card" data-active={active} data-preview={preview === id}>
				<button type="button" class="hit" onclick={() => startPreview(id)}>
					<span class="swatches">
						{#each t.swatches as c (c)}
							<span class="sw" style="background:{c}"></span>
						{/each}
					</span>
					<span class="name">{t.label}</span>
					<span class="desc">{t.description}</span>
					<span class="chips">
						<span class="chip">{id === 'terminal' ? '結構換肤' : '基準版面'}</span>
						<span class="chip"
							>{t.behavior.transition === 'curtain' ? '布簾轉場' : 'fade 轉場'}</span
						>
						<span class="chip">{t.behavior.preloader ? 'Preloader ✓' : '無 Preloader'}</span>
						{#if t.behavior.staggerScale !== 1}
							<span class="chip">進場 ×{t.behavior.staggerScale}</span>
						{/if}
					</span>
				</button>
				<div class="foot">
					{#if active}
						<span class="chip ok">使用中</span>
					{:else}
						<button type="button" class="mini" disabled={busy} onclick={() => applyAsTheme(id)}>
							設為網站主題
						</button>
					{/if}
					{#if preview === id}<span class="pv">預覽中</span>{/if}
				</div>
			</article>
		{/each}
	</div>

	{#if preview}
		<div class="pv-bar">
			<span>正在預覽「{resolveManifest(preview).label}」— 全站結構已重組（跨頁有效）</span>
			<span class="grow"></span>
			<button type="button" class="mini" onclick={() => setThemePreview(null)}>結束預覽</button>
			<button type="button" class="primary" disabled={busy} onclick={() => applyAsTheme(preview)}
				>確定採用</button
			>
		</div>
	{/if}

	{#if message}<p class="msg">{message}</p>{/if}
</section>

<style>
	.thm-title {
		font-size: 1.1rem;
		margin: 2.5rem 0 0.25rem;
	}
	.hint {
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		margin: 0 0 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.75rem;
	}
	.card {
		border: 1px solid var(--color-line);
		border-radius: 10px;
		background: var(--color-bg-elevated);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.card[data-active='true'] {
		border-color: var(--color-accent);
	}
	.card[data-preview='true'] {
		border-color: var(--color-strong);
		border-style: dashed;
	}
	.hit {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem;
		font: inherit;
	}
	.hit:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}
	.swatches {
		display: flex;
		gap: 0;
		border-radius: 6px;
		overflow: hidden;
		height: 34px;
	}
	.sw {
		flex: 1;
	}
	.name {
		font-weight: 700;
	}
	.desc {
		font-size: 0.78rem;
		color: var(--color-ink-muted);
		line-height: 1.5;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.chip {
		font-size: 0.68rem;
		border: 1px solid var(--color-line);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		color: var(--color-ink-muted);
	}
	.chip.ok {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.75rem 0.75rem;
	}
	.pv {
		font-size: 0.72rem;
		color: var(--color-strong);
	}
	.grow {
		flex: 1;
	}
	.pv-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.9rem;
		padding: 0.6rem 0.8rem;
		border: 1px dashed var(--color-strong);
		border-radius: 8px;
		font-size: 0.85rem;
	}
	.mini {
		font-size: 0.75rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid var(--color-line);
		border-radius: 6px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.primary {
		font-size: 0.78rem;
		padding: 0.25rem 0.8rem;
		border-radius: 6px;
		border: none;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		cursor: pointer;
	}
	.msg {
		margin-top: 0.75rem;
		font-size: 0.85rem;
		color: var(--color-strong);
	}
</style>
