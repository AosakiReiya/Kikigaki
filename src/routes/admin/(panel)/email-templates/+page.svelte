<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { agent } from '$lib/agent/client/agent-store.svelte';
	import { swapContent } from '$lib/animation/transition';
	import { compileEmail, usedVars } from '$lib/email/compile';
	import { sampleVars } from '$lib/email/samples';
	import { triggerOf } from '$lib/email/triggers';

	import type { TemplateRow } from '$lib/server/email-templates';
	import { EMAIL_VAR_WHITELIST } from '$lib/email/compile';

	let { data } = $props();
	let list = $state<TemplateRow[]>(data.templates);
	let slug = $state(list[0]?.slug ?? '');
	let detail = $state<
		| (TemplateRow & {
				versions: {
					version: number;
					subject: string;
					createdBy: string;
					changeNote: string | null;
					createdAt: number;
				}[];
		  })
		| null
	>(null);
	let subject = $state('');
	let source = $state('');
	let changeNote = $state('');
	// language variant: '' = applies to all locales; a chosen locale's triggers prefer this template
	let locale = $state('');
	let preview = $state<{
		html: string;
		errors: string[];
		subject: string;
		varsUsed?: string[];
		text?: string;
	} | null>(null);
	let device = $state<'desktop' | 'mobile'>('desktop');
	let editorEl: HTMLElement | undefined = $state();
	let frameEl: HTMLDivElement | undefined = $state();
	let busy = $state(false);
	let msg = $state('');
	let creating = $state(false);
	let newSlug = $state('');
	let newName = $state('');
	// kept in sync with TEMPLATE_TYPES in $lib/server/email-templates (client can't import server modules)
	const TEMPLATE_TYPES = [
		'welcome',
		'verify_email',
		'password_reset',
		'comment_reply',
		'new_comment',
		'newsletter',
		'purchase_thanks',
		'system',
		'custom'
	] as const;
	let newType = $state<(typeof TEMPLATE_TYPES)[number]>('custom');

	async function loadDetail(s: string): Promise<void> {
		msg = '';
		try {
			const r = await fetch('/api/admin/email/templates/' + encodeURIComponent(s));
			detail = await r.json();
			if (detail) {
				subject = detail.subject;
				source = detail.source;
				locale = detail.locale ?? '';
			}
			changeNote = '';
		} catch {
			detail = null;
		}
	}
	async function refreshList(): Promise<void> {
		const r = await fetch('/api/admin/email/templates');
		list = (await r.json()).templates;
	}
	onMount(() => {
		if (slug) void loadDetail(slug);
	});
	$effect(() => {
		if (slug) void loadDetail(slug);
	});

	// live preview: local compile (pure function, updates per keystroke; the server re-validates only on save)
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		void subject;
		void source;
		clearTimeout(timer);
		timer = setTimeout(() => {
			const r = compileEmail(source, sampleVars(), subject);
			preview = {
				html: r.html,
				errors: r.errors,
				subject: r.subject,
				varsUsed: usedVars(`${source} ${subject}`),
				text: r.text
			};
		}, 120);
	});

	async function save(): Promise<void> {
		busy = true;
		msg = '';
		const r = await fetch('/api/admin/email/templates/' + encodeURIComponent(slug), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				subject,
				source,
				changeNote: changeNote || undefined,
				locale: locale || null
			})
		});
		const j = await r.json();
		busy = false;
		if (!r.ok) {
			msg = `❌ ${j.errors?.join('；')}`;
			return;
		}
		msg = `✅ 已儲存為 v${j.version}`;
		await Promise.all([refreshList(), loadDetail(slug)]);
	}
	async function activate(v: number): Promise<void> {
		await fetch('/api/admin/email/templates/' + encodeURIComponent(slug), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'activate', version: v })
		});
		await Promise.all([refreshList(), loadDetail(slug)]);
	}
	async function rollback(v: number): Promise<void> {
		await fetch('/api/admin/email/templates/' + encodeURIComponent(slug), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'rollback', version: v })
		});
		await Promise.all([refreshList(), loadDetail(slug)]);
	}
	async function toggleFlag(flag: 'enabled' | 'isDefault', val: boolean): Promise<void> {
		await fetch('/api/admin/email/templates/' + encodeURIComponent(slug), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'flags', [flag]: val })
		});
		await refreshList();
		void loadDetail(slug);
	}
	/* * duplicate this template as a variant for a given locale (slug-<locale>, same type → pickTemplate prefers it per locale) */
	async function forkLocale(): Promise<void> {
		const d = detail;
		if (!d) return;
		const options = ['zh-cn', 'en', 'jp'].filter(
			(lc) => !list.some((t) => t.type === d.type && t.locale === lc)
		);
		if (options.length === 0) {
			msg = '此類型的所有語系變體都已存在';
			return;
		}
		const lc = prompt(`新增語言變體（可選：${options.join(' / ')}）`, options[0]);
		if (!lc || !options.includes(lc.trim())) return;
		const code = lc.trim();
		const newSlug = `${d.slug}-${code}`;
		if (list.some((t) => t.slug === newSlug)) {
			msg = `❌ ${newSlug} 已存在`;
			return;
		}
		busy = true;
		const r = await fetch('/api/admin/email/templates', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				slug: newSlug,
				name: `${d.name}（${code}）`,
				type: d.type,
				locale: code,
				subject,
				source,
				changeNote: `語言變體：複製自 ${d.slug}`
			})
		});
		const j = await r.json();
		busy = false;
		if (!r.ok) {
			msg = `❌ ${j.errors?.join('；') ?? '建立失敗'}`;
			return;
		}
		await refreshList();
		slug = newSlug;
		msg = `✅ 已建立 ${code} 變體`;
	}

	async function createTpl(): Promise<void> {
		if (!newSlug.trim()) return;
		const r = await fetch('/api/admin/email/templates', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				slug: newSlug.trim(),
				name: newName.trim() || newSlug.trim(),
				type: newType,
				subject: '{{site.name}} 通知',
				source:
					'<Email preheader="新範本">\n\t<Header />\n\t<Text>內容…</Text>\n\t<Footer />\n</Email>'
			})
		});
		const j = await r.json();
		if (!r.ok) {
			msg = `❌ ${j.errors?.join('；')}`;
			return;
		}
		creating = false;
		newSlug = '';
		newName = '';
		await refreshList();
		slug = j.slug ?? newSlug;
	}
	function swapFrame(d: 'desktop' | 'mobile'): void {
		if (d === device || !frameEl) {
			device = d;
			return;
		}
		void swapContent(frameEl, () => (device = d));
	}

	// Agent environment context (Workshop pattern): the floating Agent sees the current template and unsaved draft
	let ctxTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const d = detail;
		if (!d) return;
		void subject;
		void source;
		clearTimeout(ctxTimer);
		ctxTimer = setTimeout(() => {
			agent.setContext({
				emailTemplate: {
					slug: d.slug,
					name: d.name,
					type: d.type,
					version: d.currentVersion,
					subject,
					source,
					dirty: subject !== d.subject || source !== d.source
				}
			});
		}, 700);
	});
	onDestroy(() => {
		clearTimeout(ctxTimer);
		agent.setContext({ emailTemplate: undefined });
	});

	const dirty = $derived(
		detail !== null && (subject !== detail.subject || source !== detail.source)
	);
</script>

<h1 class="title">Email 範本編輯器</h1>
<p class="note">
	DSL → email-safe HTML（table 佈局／inline CSS）。 變數（如 site.name、post.title）限白名單 {EMAIL_VAR_WHITELIST.length}
	個；保存即新版本。
	<a href="/admin/settings">← Email 設定</a> ·
	<a href="/admin/email-logs">發送紀錄</a>
</p>

<div class="wrap">
	<aside class="side">
		{#each list as t (t.id)}
			<button
				class="tpl"
				class:active={t.slug === slug}
				type="button"
				onclick={() => {
					if (t.slug === slug || !editorEl) {
						slug = t.slug;
						return;
					}
					void swapContent(editorEl, () => (slug = t.slug));
				}}
			>
				<span>{t.name}</span>
				<small
					>{t.type}{#if triggerOf(t.type).status === 'live'}<b class="dot live" title="事件已接線"
							>●</b
						>{/if}
					{t.locale ? ` · ${t.locale}` : ''} · v{t.currentVersion}{t.isDefault
						? ' ★'
						: ''}{!t.enabled ? ' ⊘' : ''}</small
				>
			</button>
		{/each}
		{#if creating}
			<div class="newform">
				<input placeholder="slug（英文-連字號）" bind:value={newSlug} />
				<input placeholder="名稱" bind:value={newName} />
				<select bind:value={newType}>
					{#each TEMPLATE_TYPES as tt (tt)}
						<option value={tt}>{tt} — {triggerOf(tt).desc.slice(0, 14)}…</option>
					{/each}
				</select>
				<button type="button" onclick={() => void createTpl()}>建立</button>
				<button type="button" onclick={() => (creating = false)}>取消</button>
			</div>
		{:else}
			<button class="newbtn" type="button" onclick={() => (creating = true)}>＋ 新範本</button>
		{/if}
	</aside>

	{#if detail}
		<section class="editor" bind:this={editorEl}>
			<div class="head">
				<h2>{detail.name}<small>{detail.slug}</small></h2>
				<div class="flags">
					<button class="ghost-sm" type="button" disabled={busy} onclick={() => void forkLocale()}>
						＋ 語言變體
					</button>
					<label class="check">
						<input
							type="checkbox"
							checked={detail.enabled}
							onchange={(e) =>
								void toggleFlag('enabled', (e.currentTarget as HTMLInputElement).checked)}
						/> 啟用
					</label>
					<label class="check">
						<input
							type="checkbox"
							checked={detail.isDefault}
							onchange={(e) =>
								void toggleFlag('isDefault', (e.currentTarget as HTMLInputElement).checked)}
						/> 此類型預設
					</label>
				</div>
			</div>
			<div class="trigger" data-status={triggerOf(detail.type).status}>
				<span class="tbadge"
					>{#if triggerOf(detail.type).status === 'live'}✅ 已接線{:else if triggerOf(detail.type).status === 'planned'}⏳
						尚未接線{:else}✉️ 手動／API{/if}</span
				>
				<span class="tdesc">{triggerOf(detail.type).desc}</span>
			</div>
			<div class="field">
				<span class="label">語言變體（選單語系＝該語系觸發優先取此範本；「全部」＝通用）</span>
				<select bind:value={locale}>
					<option value="">全部語系</option>
					{#each ['zh-tw', 'zh-cn', 'en', 'jp'] as lc (lc)}
						<option value={lc}>{lc}</option>
					{/each}
				</select>
			</div>
			<label class="field">
				<span class="label">主旨（支援變數）</span>
				<input type="text" bind:value={subject} />
			</label>
			<label class="field">
				<span class="label">DSL 源碼</span>
				<textarea class="src" rows="18" spellcheck="false" bind:value={source}></textarea>
			</label>
			<label class="field">
				<span class="label">版本備註（選填）</span>
				<input type="text" bind:value={changeNote} placeholder="改了什么" />
			</label>
			<div class="row">
				<button
					class="btn primary"
					type="button"
					disabled={busy || !dirty}
					onclick={() => void save()}
				>
					{busy ? '儲存中…' : dirty ? '儲存新版本' : '已儲存'}
				</button>
				{#if msg}<span class="note" role="status">{msg}</span>{/if}
			</div>

			<h3>版本（{detail.versions.length}）</h3>
			<ul class="versions">
				{#each detail.versions as v (v.version)}
					<li class={v.version === detail.currentVersion ? 'cur' : ''}>
						<span>v{v.version}{v.version === detail.currentVersion ? ' ● 使用中' : ''}</span>
						<small
							>{new Date(v.createdAt).toISOString().slice(0, 16).replace('T', ' ')} · {v.createdBy}{v.changeNote
								? ` · ${v.changeNote}`
								: ''}</small
						>
						{#if v.version !== detail.currentVersion}
							<button type="button" onclick={() => void activate(v.version)}>啟用</button>
							<button type="button" onclick={() => void rollback(v.version)}>回滾為新版</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<section class="preview">
			<div class="phead">
				<h3>即時預覽</h3>
				<div class="seg">
					<button type="button" class:on={device === 'desktop'} onclick={() => swapFrame('desktop')}
						>Desktop</button
					>
					<button type="button" class:on={device === 'mobile'} onclick={() => swapFrame('mobile')}
						>Mobile</button
					>
				</div>
			</div>
			{#if preview && !preview.errors.length}
				<p class="fromhint">主旨：<b>{preview.subject}</b></p>
				{#if preview.varsUsed?.length}
					<p class="varchips">
						{#each preview.varsUsed as v (v)}<code>{'{{' + v + '}}'}</code>{/each}
					</p>
					<p class="note">
						示範值＝預覽用；實際發送由系統注入。text 版 {preview.text?.length ?? 0} 字元。
					</p>
				{/if}
			{/if}
			{#if preview?.errors.length}
				<div class="errs">
					{#each preview.errors as e (e)}
						<p>⚠️ {e}</p>
					{/each}
				</div>
			{/if}
			<div class="frame" class:mobile={device === 'mobile'} bind:this={frameEl}>
				<!-- srcdoc sandbox: admin global CSS doesn't apply — WYSIWYG equals the inbox; sandbox disables scripts -->
				<iframe
					title="郵件預覽"
					class="mailframe"
					sandbox=""
					srcdoc={preview?.html ?? ''}
					onload={(e) => {
						const f = e.currentTarget as HTMLIFrameElement;
						try {
							f.style.height = `${(f.contentDocument?.body?.scrollHeight ?? 600) + 24}px`;
						} catch {
							f.style.height = '640px';
						}
					}}
				></iframe>
			</div>
		</section>
	{/if}
</div>

<style>
	/* unified admin panel conventions: rem size ladder, --color-* tokens, --font-mono (Phase 70.5) */
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.25rem;
	}
	.wrap {
		display: grid;
		grid-template-columns: 12.5rem minmax(20rem, 1fr) minmax(20rem, 35rem);
		gap: 1rem;
		margin-top: 0.75rem;
		align-items: start;
	}
	@media (max-width: 68rem) {
		.wrap {
			grid-template-columns: 1fr;
		}
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.tpl {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-ink);
		cursor: pointer;
		text-align: left;
		transition:
			border-color 0.2s ease,
			background 0.2s ease;
	}
	.tpl:hover {
		border-color: var(--color-ink);
	}
	.tpl.active {
		border-color: var(--color-accent);
		background: color-mix(in oklab, var(--color-accent) 12%, transparent);
	}
	.tpl small {
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
	}
	.newbtn {
		margin-top: 0.375rem;
		padding: 0.375rem;
		border-radius: 0.5rem;
		border: 1px dashed var(--color-line);
		background: transparent;
		color: var(--color-ink-muted);
		cursor: pointer;
	}
	.newbtn:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.newform {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
	}
	.newform input,
	.newform select {
		padding: 0.3125rem 0.4375rem;
		border-radius: 0.375rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		color: var(--color-ink);
	}
	.editor,
	.preview {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		min-width: 0;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}
	.head h2 {
		margin: 0;
		font-size: 1rem;
	}
	.head h2 small {
		margin-left: 0.5rem;
		font-weight: 400;
		color: var(--color-ink-muted);
		font-size: 0.6875rem;
	}
	.flags {
		display: flex;
		gap: 0.625rem;
	}
	.ghost-sm {
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
		cursor: pointer;
	}
	.ghost-sm:hover:not(:disabled) {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.label {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
	.field input[type='text'],
	.field select {
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.875rem;
	}
	.src {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.5;
		padding: 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		resize: vertical;
		tab-size: 2;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.btn {
		padding: 0.4375rem 0.875rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink);
		cursor: pointer;
		font-size: 0.8125rem;
		transition:
			background 0.2s ease,
			border-color 0.2s ease;
	}
	.btn:hover:not(:disabled) {
		border-color: var(--color-ink);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn.primary {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
	}
	.trigger {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-line);
		border-left: 3px solid var(--color-line);
		border-radius: 0.5rem;
		font-size: 0.8125rem;
	}
	.trigger[data-status='live'] {
		border-left-color: #22c55e;
	}
	.trigger[data-status='planned'] {
		border-left-color: #f59e0b;
	}
	.tbadge {
		flex: none;
		font-weight: 700;
		font-size: 0.75rem;
	}
	.tdesc {
		color: var(--color-ink-muted);
		line-height: 1.5;
	}
	.dot.live {
		color: #22c55e;
		font-size: 0.5625rem;
		vertical-align: 0.125rem;
	}
	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin: 0;
	}
	.versions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
	}
	.versions li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-line);
	}
	.versions li.cur {
		border-color: var(--color-accent);
	}
	.versions li small {
		color: var(--color-ink-muted);
	}
	.versions button {
		padding: 0.1875rem 0.5625rem;
		font-size: 0.6875rem;
		border-radius: 9999px;
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink-muted);
		cursor: pointer;
	}
	.versions button:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.phead {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.phead h3 {
		margin: 0;
		font-size: 0.9375rem;
	}
	.editor h3 {
		margin: 0.5rem 0 0;
		font-size: 0.9375rem;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
	}
	.seg button {
		padding: 0.25rem 0.625rem;
		font-size: 0.6875rem;
		border-radius: 0.375rem;
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink-muted);
		cursor: pointer;
	}
	.seg button.on {
		background: color-mix(in oklab, var(--color-accent) 14%, transparent);
		color: var(--color-ink);
		border-color: var(--color-accent);
	}
	.errs {
		color: #ef4444;
		font-size: 0.8125rem;
		margin: 0;
	}
	.errs p {
		margin: 0.125rem 0;
	}
	.fromhint {
		margin: 0;
		font-size: 0.875rem;
	}
	.varchips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.25rem 0;
	}
	.varchips code {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 9999px;
		border: 1px solid var(--color-line);
		color: var(--color-ink-muted);
	}
	.frame {
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		/* email live-simulation board (inboxes are mostly light) — deliberately ignores dark mode */
		background: #f4f2ef;
		max-width: 37.5rem;
		overflow: hidden;
		transition: max-width 0.2s;
	}
	.frame.mobile {
		max-width: 23.75rem;
	}
	.mailframe {
		display: block;
		width: 100%;
		min-height: 24rem;
		border: none;
		background: #f4f2ef;
	}
</style>
