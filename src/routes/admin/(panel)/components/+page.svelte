<script lang="ts">
	/**
	 * Component Workshop (Phase 17) — develop / preview / install custom Content Components.
	 * List (official + custom) → editor: code + live compile preview + props controls + AI generate/iterate.
	 * Save = install: once enabled, `:::name` auto-mounts on post pages (the markdown scanner reads DB names).
	 */
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import WorkshopPreview from './WorkshopPreview.svelte';
	import { compileComponentSource } from '$lib/workshop/compile';
	import { agent, type ApplySuggestion } from '$lib/agent/client/agent-store.svelte';
	import AgentPanel from '$lib/components/agent/AgentPanel.svelte';
	import { invalidateCustomComponent } from '$lib/workshop/custom-registry';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let view = $state<'list' | 'edit'>('list');
	let name = $state('');
	let description = $state('');
	let code = $state('');
	let propsJson = $state('{\n  "title": "範例標題"\n}');
	let exists = $state(false);
	let aiGenerated = $state(false);
	let busy = $state(false);
	let message = $state('');

	/* ===== IDE shell state (Phase 26) ===== */
	let dockBig = $state(true);
	let autoApply = $state(true);
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	let appliedFlash = $state('');
	type CodeSnap = { code: string; props: string };
	type Draft = { code: string; props: string; ts: number };
	let draftNotice = $state<Draft | null>(null);
	let draftNames = $state<string[]>(
		typeof localStorage === 'undefined'
			? []
			: Object.keys(localStorage)
					.filter((k) => k.startsWith('kk-wk-draft:'))
					.map((k) => k.slice('kk-wk-draft:'.length))
	);
	const draftKey = (n: string) => `kk-wk-draft:${n}`;
	// textarea.value returns CRLF per the HTML spec: normalize to LF before anything lands or ships
	const norm = (x: string) => x.replace(/\r\n?/g, '\n');
	function readDraft(n: string): Draft | null {
		try {
			const raw = localStorage.getItem(draftKey(n));
			if (!raw) return null;
			const d = JSON.parse(raw) as Draft;
			return typeof d?.code === 'string' ? d : null;
		} catch {
			return null;
		}
	}
	function clearDraft(n: string): void {
		try {
			localStorage.removeItem(draftKey(n));
		} catch {
			/* ignore */
		}
		draftNames = draftNames.filter((x) => x !== n);
	}
	let undoStack: CodeSnap[] = $state([]);
	try {
		autoApply = localStorage.getItem('kk-wk-autoapply') !== '0';
	} catch {
		/* ignore */
	}
	// draft auto-persist (Phase 36): debounced localStorage writes while editing existing components; paused while a prompt is open to avoid clobbering
	let draftTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const n = name;
		const c = code;
		const pr = propsJson;
		const ed = view === 'edit' && exists;
		const pend = draftNotice !== null;
		clearTimeout(draftTimer);
		if (!n || !ed || !c.trim() || pend) return;
		draftTimer = setTimeout(() => {
			try {
				localStorage.setItem(
					draftKey(n),
					JSON.stringify({ code: norm(c), props: pr, ts: Date.now() })
				);
				if (!draftNames.includes(n)) draftNames = [...draftNames, n];
			} catch {
				/* quota */
			}
		}, 600);
	});
	function restoreDraft(): void {
		if (!draftNotice) return;
		code = draftNotice.code;
		if (validJson(draftNotice.props)) propsJson = draftNotice.props;
		draftNotice = null;
	}
	function discardDraft(): void {
		if (name) clearDraft(name);
		draftNotice = null;
	}

	function syncAutoApply(): void {
		try {
			localStorage.setItem('kk-wk-autoapply', autoApply ? '1' : '0');
		} catch {
			/* ignore */
		}
	}
	// message change → toast (feedback previously buried at the page bottom, now in view)
	$effect(() => {
		const m = message;
		if (!m) return;
		toast = m;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 3600);
	});
	function validJson(x: string): boolean {
		try {
			const v: unknown = JSON.parse(x);
			return !!v && typeof v === 'object';
		} catch {
			return false;
		}
	}
	function consumeApply(x: ApplySuggestion): void {
		undoStack = [...undoStack.slice(-19), { code, props: propsJson }];
		code = x.code;
		if (x.props && validJson(x.props)) propsJson = x.props;
		x.consumed = true;
		appliedFlash = x.name; // persistent bar: doesn't vanish before restore or next apply (preview/edit operate safely)
	}
	function closeFlash(): void {
		appliedFlash = '';
		undoStack = [];
	}
	function undoApply(): void {
		const prev = undoStack.at(-1);
		if (!prev) return;
		undoStack = undoStack.slice(0, -1);
		code = prev.code;
		propsJson = prev.props;
		if (!undoStack.length) appliedFlash = '';
	}
	const pendingApply = $derived(
		agent.applies.filter((x) => !x.consumed && x.name === name).at(-1) ?? null
	);
	$effect(() => {
		const x = pendingApply;
		if (x && autoApply && name) consumeApply(x);
	});

	/* * development project id: one development history per component (multiple Sessions) */
	const devProject = $derived(name.trim() ? `component:${name.trim()}` : null);

	// selected component + unsaved draft injected into the global Agent context (debounce 700ms against typing storms)
	let ctxTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const n = name;
		const c = code;
		const d = description;
		void n;
		void c;
		void d;
		clearTimeout(ctxTimer);
		ctxTimer = setTimeout(() => {
			agent.setContext({
				selectedComponent: { name: n, code: c, description: d }
			});
		}, 700);
		return () => clearTimeout(ctxTimer);
	});

	const STARTER = `<script>
	let {
		title = "我的元件",
		items = []
	} = $props();
${'<'}/script>

<div class="panel">
	<h3>{title}</h3>
	{#if items.length}
		<ul>{#each items as it (it)}<li>{it}</li>{/each}</ul>
	{:else}
		<p class="muted">（尚無資料）</p>
	{/if}
</div>

<style>
	.flash .fx {
		border: none;
		background: none;
		cursor: pointer;
		color: inherit;
		font-size: 0.85rem;
		opacity: 0.7;
		padding: 0 0.2rem;
	}
	.flash .fx:hover {
		opacity: 1;
	}
	.flash.draft {
		border-color: color-mix(in srgb, #d97706 45%, transparent);
	}
	.rchip {
		font-size: 0.7rem;
		padding: 0.08rem 0.45rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, #d97706 45%, transparent);
		color: #b45309;
		white-space: nowrap;
	}
	.rchip.ok {
		border-color: color-mix(in srgb, #16a34a 45%, transparent);
		color: #15803d;
	}
	.chip.pend {
		border-color: color-mix(in srgb, #d97706 45%, transparent);
		color: #b45309;
	}
	.chip.ok {
		border-color: color-mix(in srgb, #16a34a 45%, transparent);
		color: #15803d;
	}
	.chip.drf {
		border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
		color: var(--color-accent);
	}
	.panel {
		margin: 2rem 0;
		padding: 1.25rem 1.5rem;
		border: 1px solid var(--color-line, #e4e2db);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated, #fff);
	}
	h3 { margin: 0 0 0.5rem; color: var(--color-accent, #141414); }
	ul { margin: 0; padding-left: 1.25rem; line-height: 1.8; }
	.muted { color: var(--color-ink-muted, #6b6963); font-size: 0.875rem; }
</style>
`;

	function newComponent() {
		view = 'edit';
		name = '';
		description = '';
		code = STARTER;
		propsJson = '{\n  "title": "我的元件",\n  "items": ["第一項", "第二項"]\n}';
		exists = false;
		aiGenerated = false;
		message = '';
		appliedFlash = '';
		undoStack = [];
		draftNotice = null;
	}

	function edit(c: { name: string; description: string }) {
		const loaded = data.ready ? data.components.find((x) => x.name === c.name) : undefined;
		view = 'edit';
		name = c.name;
		description = c.description;
		code = '';
		propsJson = '{\n  "title": "範例"\n}';
		exists = true;
		aiGenerated = loaded?.aiGenerated ?? false;
		message = '';
		appliedFlash = '';
		undoStack = [];
		draftNotice = null;
		void loadCode(c.name);
	}

	async function loadCode(n: string) {
		try {
			const res = await fetch(`/api/admin/components/code?name=${encodeURIComponent(n)}`);
			if (res.ok) {
				const j = (await res.json()) as { code?: string };
				code = norm(j.code ?? '');
				const d = readDraft(n);
				draftNotice = d && norm(d.code) !== code ? d : null;
				if (d && norm(d.code) === code) clearDraft(n);
			} else {
				message = `✗ 無法載入 ${n} 原始碼（可能已停用）`;
			}
		} catch {
			message = '✗ 載入失敗';
		}
	}

	async function post(action: string, fields: Record<string, string>) {
		busy = true;
		message = '';
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		try {
			const res = await fetch(`/admin/components?/${action}`, { method: 'POST', body: fd });
			const outcome = deserialize(await res.text()) as {
				type?: string;
				data?: { message?: string; code?: string; ok?: boolean };
			};
			const m = outcome?.data?.message ?? '';
			if (!res.ok || outcome?.type !== 'success') {
				message = `✗ ${m || `HTTP ${res.status}`}`;
				return null;
			}
			return outcome.data ?? null;
		} finally {
			busy = false;
		}
	}

	async function save() {
		code = norm(code);
		if (!name.trim()) {
			message = '✗ 需要元件名稱（:::name 用）';
			return;
		}
		// final local validation: no save unless it compiles
		const check = await compileComponentSource(name, code);
		if (!check.ok) {
			message = `✗ 編譯失敗：${check.error}`;
			return;
		}
		const d = await post('save', {
			name,
			description,
			code,
			ai: aiGenerated ? 'on' : 'off'
		});
		if (d?.ok) {
			invalidateCustomComponent(name);
			exists = true;
			appliedFlash = '';
			undoStack = [];
			clearDraft(name);
			message = `✓ ${d.message} — 文章裡用 :::${name} 即插入`;
			void invalidateAll();
		}
	}

	async function reviewOp(r: 'approved' | 'pending'): Promise<void> {
		const d = await post('review', { name, review: r });
		if (d?.ok) {
			invalidateCustomComponent(name);
			void invalidateAll();
		}
	}

	async function toggle(c: { name: string; enabled: boolean }) {
		await post('toggle', { name: c.name, enabled: c.enabled ? 'off' : 'on' });
		invalidateCustomComponent(c.name);
		await invalidateAll();
	}

	async function remove(c: { name: string }) {
		if (!confirm(`刪除元件「${c.name}」？文章中的 :::${c.name} 區塊將顯示空白。`)) return;
		await post('delete', { name: c.name });
		invalidateCustomComponent(c.name);
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>元件 Workshop — Admin</title>
</svelte:head>

{#if !data.ready}
	<p>資料庫未配置。</p>
{:else if view === 'list'}
	<section class="head">
		<div>
			<h1>元件 Workshop</h1>
			<p class="sub">
				自訂 Content Component：編寫 → 即時預覽 → 儲存即安裝（文章以 <code>:::名稱</code> 嵌入）。
			</p>
		</div>
		<button type="button" class="primary" onclick={newComponent}>＋ 新元件</button>
	</section>

	<h2>官方元件（唯讀）</h2>
	<div class="official">
		{#each data.official as o (o.name)}
			<code>:::{o.name}</code>
		{/each}
	</div>

	<h2>自訂元件</h2>
	{#if data.components.length === 0}
		<p class="empty">還沒有自訂元件 — 按「＋ 新元件」開一個，直接用右側 Agent 開發。</p>
	{:else}
		<div class="grid">
			{#each data.components as c (c.name)}
				<article class="card" data-off={!c.enabled}>
					<header>
						<span class="cname">{c.name}</span>
						{#if c.aiGenerated}<span class="chip ai">AI</span>{/if}
						{#if data.reviews[c.name] === 'pending'}
							<span class="chip pend">審核中</span>
						{:else if data.reviews[c.name] === 'approved'}
							<span class="chip ok">已批准</span>
						{/if}
						{#if draftNames.includes(c.name)}<span class="chip drf">編輯中●</span>{/if}
						{#if !c.enabled}<span class="chip">停用</span>{/if}
					</header>
					<p class="cdesc">{c.description || '（無描述）'}</p>
					<div class="crows">
						<button type="button" class="mini" onclick={() => edit(c)}>編輯</button>
						<button type="button" class="mini" onclick={() => toggle(c)}
							>{c.enabled ? '停用' : '啟用'}</button
						>
						<button type="button" class="mini danger" onclick={() => remove(c)}>刪除</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}
{:else}
	<section class="ide">
		<header class="ihead">
			<button type="button" class="mini back" onclick={() => (view = 'list')}>← 返回列表</button>
			<h1>{exists ? `編輯 ${name}` : '新元件'}</h1>
			<label class="mname">
				名稱（:::name）
				<input type="text" bind:value={name} disabled={exists} placeholder="my-widget" />
			</label>
			<label class="mdesc">
				說明
				<input type="text" bind:value={description} placeholder="一句話描述這個元件做什麼" />
			</label>
			<label class="tgl" title="Agent 編譯通過後自動寫入編輯器（可一鍵還原）">
				<input type="checkbox" bind:checked={autoApply} onchange={syncAutoApply} />
				自動套用
			</label>
			{#if exists && data.reviews[name]}
				<span class="rchip" class:ok={data.reviews[name] === 'approved'}>
					{data.reviews[name] === 'approved' ? '✓ 已批准' : '⏳ 審核中'}
				</span>
				{#if data.reviews[name] === 'pending'}
					<button type="button" class="mini primary" onclick={() => void reviewOp('approved')}
						>批准並啟用</button
					>
				{:else}
					<button
						type="button"
						class="mini"
						title="重新回到待審狀態（前台掛載將暫停）"
						onclick={() => void reviewOp('pending')}>送審</button
					>
				{/if}
			{/if}
			<span class="grow"></span>
			<button type="button" class="primary" onclick={save} disabled={busy || !code.trim()}>
				{busy ? '儲存中…' : '儲存並安裝'}
			</button>
		</header>

		{#if appliedFlash}
			<div class="flash" role="status">
				✓ 已套用 Agent 編譯通過的 {appliedFlash} 版本
				<button type="button" onclick={undoApply} disabled={!undoStack.length}>↶ 還原</button>
				<button type="button" class="fx" title="保留此版並關閉提示" onclick={closeFlash}>✕</button>
			</div>
		{/if}

		<div class="isplit">
			<div class="codepane">
				{#if draftNotice}
					<div class="flash draft" role="status">
						📝 有未儲存的編輯草稿（{new Date(draftNotice.ts).toLocaleString()}）
						<button type="button" onclick={restoreDraft}>恢復</button>
						<button type="button" onclick={discardDraft}>捨棄</button>
					</div>
				{/if}
				{#if pendingApply && !autoApply}
					<div class="flash" role="status">
						⚡ Agent 有新編譯通過版本
						<button type="button" onclick={() => pendingApply && consumeApply(pendingApply)}>
							套用
						</button>
					</div>
				{/if}
				<textarea
					class="code"
					spellcheck="false"
					bind:value={code}
					placeholder="元件原始碼（Svelte 5 runes，不可 import 外部模組）"></textarea>
			</div>
			<div class="rpane">
				<h3 class="pv">即時預覽（真實編譯＋掛載）</h3>
				<label class="propslabel">
					預覽 props（JSON）
					<textarea class="props" spellcheck="false" bind:value={propsJson} rows="3"></textarea>
				</label>
				<div class="pvscroll" class:flash={!!appliedFlash}>
					<WorkshopPreview {name} {code} {propsJson} />
				</div>
			</div>
		</div>

		<div class="dock" class:min={!dockBig}>
			<div class="dockbar">
				<button
					type="button"
					class="mini"
					onclick={() => (dockBig = !dockBig)}
					title="Agent dock 大小">{dockBig ? '▾ 收合' : '▴ Agent 開發面板'}</button
				>
				<span class="docktitle"
					>✦ Agent — {name ? `開發 ${name}` : '未命名元件（於上方填名稱後歸檔 Session）'}</span
				>
			</div>
			<div class="agentbox">
				<AgentPanel embedded project={devProject} />
			</div>
		</div>

		{#if toast}
			<div class="toast" class:bad={toast.startsWith('✗')} role="status">{toast}</div>
		{/if}
	</section>
{/if}

<style>
	.head {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}

	h1 {
		margin: 0;
		font-size: 1.375rem;
	}

	.sub {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.sub code,
	h2 {
		margin: 1.75rem 0 0.75rem;
		font-size: 0.9375rem;
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.official {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.official code {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.3125rem 0.625rem;
		color: var(--color-accent);
		background: var(--color-bg-elevated);
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.875rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.75rem;
	}

	.card {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated);
		padding: 0.875rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.card[data-off='true'] {
		opacity: 0.55;
	}

	.card header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.cname {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	.chip {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.3125rem;
		padding: 0.0625rem 0.3125rem;
		color: var(--color-ink-muted);
	}

	.chip.ai {
		color: #a78bfa;
		border-color: color-mix(in srgb, #a78bfa 50%, var(--color-line));
	}

	.cdesc {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}

	.crows {
		display: flex;
		gap: 0.375rem;
	}

	.grow {
		flex: 1;
	}

	.ide {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		height: calc(100dvh - 5rem);
		min-height: 30rem;
		overflow: hidden;
	}

	.ihead {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.ihead h1 {
		margin: 0;
		font-size: 1.05rem;
		white-space: nowrap;
	}

	.ihead label {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.6rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-muted);
	}

	.ihead input[type='text'] {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.32rem 0.5rem;
		color: var(--color-ink);
		font-size: 0.76rem;
	}

	.ihead .mname input {
		width: 9.5rem;
	}

	.ihead .mdesc input {
		width: 13rem;
	}

	.ihead .tgl {
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.68rem;
		cursor: pointer;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.55rem;
	}

	.isplit {
		flex: 1 1 55%;
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 0.6rem;
		min-height: 0;
	}

	.dock {
		flex: 0 0 45%;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		overflow: hidden;
		background: var(--color-bg);
		transition: flex-basis 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.dock.min {
		flex: 0 0 auto;
	}

	.dockbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		flex: none;
	}

	.dock.min .dockbar {
		border-bottom: 0;
	}

	.docktitle {
		font-size: 0.72rem;
		color: var(--color-ink-muted);
		font-family: var(--font-display);
	}

	.dock.min .agentbox {
		display: none;
	}

	.codepane,
	.rpane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		gap: 0.4rem;
	}

	.codepane textarea.code {
		flex: 1;
		min-height: 0;
		height: auto;
		resize: none;
	}

	.rpane {
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		padding: 0.6rem 0.7rem;
		background: var(--color-bg-elevated);
		gap: 0.5rem;
	}

	.pv {
		margin: 0;
		font-size: 0.78rem;
		font-family: var(--font-display);
		color: var(--color-ink-muted);
	}

	.rpane textarea.props {
		background: var(--color-bg);
		resize: none;
		flex: none;
	}

	.pvscroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		border-radius: 0.6rem;
		transition: box-shadow 0.3s ease;
	}

	.pvscroll.flash {
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 65%, transparent);
	}

	.agentbox {
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.flash {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.74rem;
		border: 1px solid color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
		background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-elevated));
		border-radius: 0.55rem;
		padding: 0.35rem 0.6rem;
	}

	.flash button {
		border: 1px solid var(--color-accent);
		background: var(--color-accent);
		color: var(--color-accent-ink);
		border-radius: 0.4rem;
		font-size: 0.68rem;
		padding: 0.15rem 0.55rem;
		cursor: pointer;
	}

	.flash button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.toast {
		position: fixed;
		right: 1.25rem;
		top: 1.1rem;
		z-index: 35;
		max-width: 26rem;
		background: var(--color-bg-elevated);
		border: 1px solid #34d39966;
		color: #34d399;
		border-radius: 0.7rem;
		padding: 0.6rem 0.9rem;
		font-size: 0.8rem;
		box-shadow: 0 10px 34px rgb(0 0 0 / 28%);
	}

	.toast.bad {
		border-color: #f8717166;
		color: #f87171;
	}

	.propslabel {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--color-ink-muted);
	}

	textarea {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.5625rem 0.75rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
	}

	textarea.code {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.65;
		resize: vertical;
		tab-size: 2;
	}

	textarea.props {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		resize: vertical;
	}

	.primary {
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
	}

	.mini:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}

	.mini.danger:hover {
		color: #f87171;
		border-color: #f87171;
	}

	.mini.back {
		font-size: 0.8125rem;
	}

	@media (max-width: 1023px) {
		.ide {
			height: auto;
			min-height: 0;
		}

		.isplit {
			grid-template-columns: minmax(0, 1fr);
		}

		.codepane textarea.code {
			min-height: 18rem;
		}

		.dock {
			flex: 0 0 auto;
		}

		.dock:not(.min) .agentbox {
			min-height: 26rem;
		}

		.rpane {
			min-height: 20rem;
		}

		.ihead .mdesc {
			display: none;
		}
	}
</style>
