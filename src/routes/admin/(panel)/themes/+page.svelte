<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import { agent } from '$lib/agent/client/agent-store.svelte';
	import { THEME_SURFACES, type ThemeSurface } from '$lib/themes/contracts';
	import { THEME_IDS } from '$lib/themes';
	import { invalidateDbThemes } from '$lib/themes/db-registry.svelte';
	import type { DbThemeSurfaces } from '$lib/server/themes';

	let { data, form } = $props();

	interface Editing {
		id: string;
		label: string;
		description: string;
		tokens: string;
		base: string;
		surfaces: DbThemeSurfaces;
		behaviors: { transition: string; preloader: string; staggerScale: string };
	}
	let editing = $state<Editing | null>(null);
	let surface = $state<ThemeSurface>('Home');
	let compileMsg = $state('');
	let busy = $state(false);
	const SLUG_PATTERN = '[a-z0-9][a-z0-9-]{1,30}[a-z0-9]';
	const TC_PLACEHOLDER =
		'{"nav":[{"href":"/services","label":"服務"}],"pages":{"services":{"title":"我們的服務"}}}';

	const SURFACES = THEME_SURFACES as readonly ThemeSurface[];
	const code = $derived(editing?.surfaces[surface]?.code ?? '');
	const css = $derived(editing?.surfaces[surface]?.css ?? '');
	const activeCount = $derived(Object.keys(editing?.surfaces ?? {}).length);

	function openEdit(t: (typeof data.themes)[number]) {
		editing = {
			id: t.id,
			label: t.label,
			description: t.description,
			tokens: t.tokensCss,
			base: t.base,
			surfaces: JSON.parse(JSON.stringify(t.surfaces)),
			behaviors: {
				transition: t.behaviors?.transition ?? '',
				preloader: t.behaviors?.preloader === undefined ? '' : t.behaviors.preloader ? '1' : '0',
				staggerScale:
					t.behaviors?.staggerScale !== undefined ? String(t.behaviors.staggerScale) : ''
			}
		};
		surface = 'Home';
		compileMsg = '';
	}

	function setCode(v: string) {
		if (!editing) return;
		const s = { ...editing.surfaces };
		if (v.trim()) s[surface] = { ...s[surface], code: v };
		else delete s[surface];
		editing.surfaces = s;
	}
	function setCss(v: string) {
		if (!editing) return;
		const cur = editing.surfaces[surface];
		if (cur) editing.surfaces = { ...editing.surfaces, [surface]: { code: cur.code, css: v } };
	}

	/* * trial-compile the current surface (Workshop pipeline = execution-side isomorph); returns success/failure */
	async function tryCompile(name: ThemeSurface, src: string): Promise<string | null> {
		try {
			const { compileComponentSource } = await import('$lib/workshop/compile');
			const out = await compileComponentSource(`gate-${name}`, src);
			return out.ok ? null : (out.error ?? '編譯失敗');
		} catch (e) {
			return String(e);
		}
	}

	async function compileCurrent() {
		if (!code.trim()) {
			compileMsg = '（目前槽位無碼可試）';
			return;
		}
		compileMsg = '編譯中…';
		const err = await tryCompile(surface, code);
		compileMsg = err ? `✗ ${err}` : '✓ 編譯通過';
	}

	/* * save gate: every non-empty surface must compile before release */
	async function save() {
		if (!editing || busy) return;
		busy = true;
		compileMsg = '全槽位試編中…';
		for (const [k, v] of Object.entries(editing.surfaces) as [ThemeSurface, { code: string }][]) {
			if (!v?.code?.trim()) continue;
			const err = await tryCompile(k, v.code);
			if (err) {
				compileMsg = `✗ ${k}：${err}`;
				surface = k;
				busy = false;
				return;
			}
		}
		invalidateDbThemes(); // saving a new version = clear the client cache (next render recompiles)
		document.forms.namedItem('save-form')?.requestSubmit();
	}

	/** Serialize the three controls into a behaviors JSON ('' fields = follow base) */
	function behaviorsJson(): string {
		if (!editing) return '';
		const b: Record<string, unknown> = {};
		if (editing.behaviors.transition) b.transition = editing.behaviors.transition;
		if (editing.behaviors.preloader) b.preloader = editing.behaviors.preloader === '1';
		const n = Number.parseFloat(editing.behaviors.staggerScale);
		if (Number.isFinite(n)) b.staggerScale = n;
		return JSON.stringify(b);
	}

	function afterSave() {
		busy = false;
		compileMsg = '';
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false }); // refetch load (version display) and keep the edit panel
			await invalidateAll();
		};
	}

	function del(t: (typeof data.themes)[number]) {
		if (!confirm(`刪除主題「${t.label}」？此操作不可還原`)) return;
		invalidateDbThemes();
		const fd = new FormData();
		fd.set('id', t.id);
		fetch('?/delete', { method: 'POST', body: fd })
			.then(async (r) => {
				const j = await r.json().catch(() => null);
				if (!r.ok || j?.type === 'failure') alert(j?.message ?? '刪除失敗');
				else if (editing?.id === t.id) editing = null;
				await invalidateAll();
			})
			.catch(() => alert('刪除失敗'));
	}
	let ctxTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const e = editing; // track the whole draft object (incl. deep surfaces/tokens changes: setCode/setCss both swap the editing.surfaces reference)
		clearTimeout(ctxTimer);
		ctxTimer = setTimeout(() => {
			const t = e && data.themes.find((x) => x.id === e.id);
			agent.setContext({
				themeEditing: e
					? {
							id: e.id,
							label: e.label,
							base: e.base,
							version: t?.version ?? 0,
							tokens: e.tokens,
							surfaces: JSON.parse(JSON.stringify(e.surfaces)),
							dirty:
								!t ||
								t.tokensCss !== e.tokens ||
								t.label !== e.label ||
								JSON.stringify(t.surfaces) !== JSON.stringify(e.surfaces)
						}
					: undefined
			});
		}, 700);
	});
	onDestroy(() => {
		clearTimeout(ctxTimer);
		agent.setContext({ themeEditing: undefined });
	});
</script>

<h1 class="title">主題工作台</h1>
<p class="note">
	DB 主題＝<strong>免 Git 換肤</strong>：tokens（全站即時）＋槽位元件（客戶端 Workshop
	管線編譯掛載；SSR 與編譯完成前誠實回落 base 主題版面）。可用 AI 或手寫 Svelte 碼逐槽位覆蓋。
	<a href="/admin/settings">← 設計主題</a>
</p>

{#if form?.message}<p class="msg error">{form.message}</p>{/if}

<div class="grid2">
	{#if form?.imported}<p class="msg ok">✓ {form.message}</p>{/if}
	<form class="panel" method="POST" action="?/importZip" use:enhance enctype="multipart/form-data">
		<h2>匯入主題（zip）</h2>
		<p class="note">
			接受 <code>kikigaki-theme/1</code> 格式（本工作台匯出即此格式）。校驗＋靜態安全檢通過才入庫；匯入後不自動啟用。
		</p>
		<input type="file" name="file" accept=".zip" required />
		<div><button class="primary" type="submit">匯入</button></div>
	</form>

	<form class="panel" method="POST" action="?/create" use:enhance>
		<h2>新建主題</h2>
		<label class="field">
			<span class="label">Slug（小寫 a-z0-9-）</span>
			<input name="slug" required pattern={SLUG_PATTERN} placeholder="neon" />
		</label>
		<label class="field">
			<span class="label">顯示名</span>
			<input name="label" placeholder="Neon Nights" />
		</label>
		<label class="field">
			<span class="label">基底主題（回落版面＋行為）</span>
			<select name="base">
				{#each THEME_IDS as b (b)}
					<option value={b}>{b}</option>
				{/each}
			</select>
		</label>
		<div><button class="primary" type="submit">建立</button></div>
	</form>

	<form class="panel" method="POST" action="?/content" use:enhance>
		<h2>主題內容（theme_content）</h2>
		<p class="note">
			選填 JSON，主題各取所需（未知鍵自動忽略）：<code>nav</code> 接管導覽（href+label 陣列）、
			<code>hero</code> 餵行銷首頁、<code>pages.&lt;slug&gt;</code> 餵語境路由頁（如 Corporate 的 /services、/contact）。清空＝主題回落到文章資料驅動的預設佈局。
		</p>
		<textarea name="themeContent" rows="8" spellcheck="false" placeholder={TC_PLACEHOLDER}
			>{data.themeContent}</textarea
		>
		<div><button class="primary" type="submit">儲存內容</button></div>
	</form>

	<section class="panel">
		<h2>主題清單（{data.themes.length}）</h2>
		{#if !data.themes.length}
			<p class="note">尚無 DB 主題。建一個，或讓 AI 主題助手產一個。</p>
		{/if}
		{#each data.themes as t (t.id)}
			<article class="row" data-using={data.active === t.id}>
				<div>
					<strong>{t.label}</strong>
					<span class="tag">{t.id}</span>
					<span class="muted"
						>base {t.base} · v{t.version} · {Object.keys(t.surfaces).length} 槽</span
					>
					{#if data.active === t.id}<span class="pill">使用中</span>{/if}
				</div>
				<div class="acts">
					<button type="button" class="mini" onclick={() => openEdit(t)}>編輯</button>
					<a class="mini" href={`/api/admin/themes/${t.id}/export`} download>匯出</a>
					{#if data.active !== t.id}
						<form method="POST" action="?/apply" use:enhance>
							<input type="hidden" name="id" value={t.id} />
							<button class="mini" type="submit">採用</button>
						</form>
					{/if}
					<button type="button" class="mini danger" onclick={() => del(t)}>刪除</button>
				</div>
			</article>
		{/each}
	</section>
</div>

{#if editing}
	<section class="panel editor">
		<h2>
			編輯 {editing.id}
			<span class="muted">{editing.surfaces ? activeCount : 0} 槽位覆蓋</span>
			<button type="button" class="ghost close" onclick={() => (editing = null)}>收合 ✕</button>
		</h2>
		<div class="rowform">
			<label class="field">
				<span class="label">顯示名</span>
				<input bind:value={editing.label} />
			</label>
			<label class="field grow">
				<span class="label">描述</span>
				<input bind:value={editing.description} />
			</label>
		</div>
		<label class="field">
			<span class="label">設計令牌（CSS，直接注入 :root 層）</span>
			<textarea
				bind:value={editing.tokens}
				rows="5"
				spellcheck="false"
				placeholder={':root { --color-accent: #ff0; }'}></textarea>
		</label>

		<div class="rowform" aria-label="behavior">
			<label class="field grow">
				<span class="label">轉場（留空＝跟隨 base）</span>
				<select bind:value={editing.behaviors.transition}>
					<option value="">（跟隨 base）</option>
					<option value="curtain">curtain 布簾</option>
					<option value="fade">fade 淡入</option>
				</select>
			</label>
			<label class="field grow">
				<span class="label">Preloader</span>
				<select bind:value={editing.behaviors.preloader}>
					<option value="">（跟隨 base）</option>
					<option value="1">開啟</option>
					<option value="0">關閉</option>
				</select>
			</label>
			<label class="field grow">
				<span class="label">進場節奏（0.2–2）</span>
				<input
					type="number"
					step="0.1"
					min="0.2"
					max="2"
					bind:value={editing.behaviors.staggerScale}
					placeholder="跟隨 base"
				/>
			</label>
		</div>

		<div class="tabs">
			{#each SURFACES as s (s)}
				<button
					type="button"
					class:on={surface === s}
					class:covered={Boolean(editing.surfaces[s]?.code)}
					onclick={() => (surface = s)}
				>
					{s}
				</button>
			{/each}
		</div>

		<label class="field">
			<span class="label">{surface} · Svelte 碼（留空＝移除該槽位）</span>
			<textarea
				rows="10"
				spellcheck="false"
				value={code}
				oninput={(e) => setCode(e.currentTarget.value)}></textarea>
		</label>
		<label class="field">
			<span class="label">{surface} · scoped CSS</span>
			<textarea
				rows="4"
				spellcheck="false"
				value={css}
				oninput={(e) => setCss(e.currentTarget.value)}></textarea>
		</label>

		<div class="foot">
			<button type="button" class="mini" onclick={() => compileCurrent()}>試編目前槽位</button>
			<button type="button" class="primary" disabled={busy} onclick={() => save()}
				>全部試編並儲存</button
			>
			{#if compileMsg}<span class="msgline">{compileMsg}</span>{/if}
		</div>

		<form id="save-form" class="hidden" method="POST" action="?/save" use:enhance={afterSave}>
			<input type="hidden" name="id" value={editing.id} />
			<input type="hidden" name="label" value={editing.label} />
			<input type="hidden" name="description" value={editing.description} />
			<input type="hidden" name="tokens" value={editing.tokens} />
			<input type="hidden" name="base" value={editing.base} />
			<input type="hidden" name="surfaces" value={JSON.stringify(editing.surfaces)} />
			<input type="hidden" name="behaviors" value={behaviorsJson()} />
		</form>
	</section>
{/if}

<style>
	/* aligned to the unified admin vocabulary (Phase 70.5 conventions; template = email-templates/components pages) */
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}
	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin: 0;
	}
	.note a {
		color: var(--color-accent);
	}
	.msg {
		font-size: 0.875rem;
		margin: 0.5rem 0 0;
	}
	.msg.error {
		color: #ef4444;
	}
	.msg.ok {
		color: var(--color-accent);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 1.25rem;
		align-items: start;
		margin-top: 1.5rem;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated);
	}
	.panel h2 {
		margin: 0;
		font-size: 1rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.label {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	input,
	select {
		font-size: 0.875rem;
	}
	textarea {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		resize: vertical;
	}
	input[type='file'] {
		font-size: 0.8125rem;
	}
	.primary {
		align-self: flex-start;
		appearance: none;
		border: 1px solid var(--color-accent);
		border-radius: 0.625rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		padding: 0.5rem 1.125rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.primary:disabled {
		opacity: 0.55;
	}
	.mini {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.75rem;
		border-radius: 0.5rem;
		padding: 0.3125rem 0.625rem;
		cursor: pointer;
		white-space: nowrap;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
	}
	.mini:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}
	.mini.danger:hover {
		color: #f87171;
		border-color: #f87171;
	}
	.ghost {
		appearance: none;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
		padding: 0.3125rem 0.75rem;
		cursor: pointer;
	}
	.ghost:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0;
		border-top: 1px solid var(--color-line);
		font-size: 0.875rem;
	}
	.row[data-using='true'] {
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
	}
	.tag,
	.muted {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		margin-left: 0.4rem;
	}
	.pill {
		font-size: 0.6875rem;
		border: 1px solid var(--color-accent);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		color: var(--color-accent);
		margin-left: 0.4rem;
	}
	.acts {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.acts form {
		margin: 0;
	}
	.editor h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.close {
		margin-left: auto;
	}
	.rowform {
		display: flex;
		gap: 1rem;
	}
	.grow {
		flex: 1;
	}
	/* slot segmented control = same as email-templates .seg */
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}
	.tabs button {
		padding: 0.25rem 0.625rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		border-radius: 0.375rem;
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink-muted);
		cursor: pointer;
	}
	.tabs button.on {
		background: color-mix(in oklab, var(--color-accent) 14%, transparent);
		color: var(--color-ink);
		border-color: var(--color-accent);
	}
	.tabs button.covered::after {
		content: ' ●';
		color: var(--color-accent);
	}
	.foot {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
	.msgline {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.hidden {
		display: none;
	}
</style>
