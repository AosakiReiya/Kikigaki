<script lang="ts">
	import { tick } from 'svelte';
	import { ensureGsap } from '$lib/animation/core';

	const gsap = ensureGsap();
	import { agent, type ChatItem } from '$lib/agent/client/agent-store.svelte';
	import { miniMd } from '$lib/agent/client/minimd';
	import { prefersReduced } from '$lib/agent/client/motion';
	import type { AgentMode } from '$lib/agent/runtime/types';

	let { embedded = false, project = null }: { embedded?: boolean; project?: string | null } =
		$props();

	function preferredModel(): string | null {
		return typeof localStorage !== 'undefined' ? localStorage.getItem('kk-agent-model') : null;
	}

	let input = $state('');
	let listEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();
	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let expandedTool = $state<number | null>(null);
	let sessionsView = $state(false);
	let didInit = $state(false);
	let railEl: HTMLDivElement | undefined = $state();
	let confirmDel = $state<string | null>(null);

	function toggleSessions(): void {
		sessionsView = !sessionsView;
	}
	let sessCloseTimer: ReturnType<typeof setTimeout> | undefined;
	function closeSessions(): void {
		sessionsView = false;
	}
	/* * defer closing after a single toggle; a double-click rename within 350ms cancels the close (click/dblclick coexistence) */
	function pickSession(id: string): void {
		clearTimeout(sessCloseTimer);
		void agent.selectSession(id);
		sessCloseTimer = setTimeout(() => (sessionsView = false), 350);
	}

	function askDel(id: string): void {
		if (confirmDel === id) {
			confirmDel = null;
			void agent.remove(id);
			return;
		}
		confirmDel = id;
		setTimeout(() => {
			if (confirmDel === id) confirmDel = null;
		}, 2600);
	}
	$effect(() => {
		if (!didInit) {
			didInit = true;
			void agent.refreshSessions();
		}
	});

	const builtinHints: Record<string, string> = {
		chat: '唯讀對話與研讀',
		plan: '調查＋計畫，寫入一律提案',
		build: '自主執行（OpenCode Build 同構）：多輪迭代，高風險暫停待批',
		explore: '快速探索站內內容（唯讀批次查）'
	};
	/* * Phase 32: agents dropdown (admin definitions ∪ built-in fallbacks) */
	const agentSeg = $derived.by(() => {
		const list = agent.agents.length
			? agent.agents.map((a) => ({
					id: a.name,
					label: a.name.charAt(0).toUpperCase() + a.name.slice(1),
					hint:
						a.description || (builtinHints[a.name] ?? `基座 ${a.baseMode}・上限 ${a.riskCeiling}`),
					mode: a.baseMode
				}))
			: [
					{ id: 'chat', label: 'Chat', hint: builtinHints.chat, mode: 'chat' as AgentMode },
					{ id: 'plan', label: 'Plan', hint: builtinHints.plan, mode: 'plan' as AgentMode },
					{ id: 'build', label: 'Build', hint: builtinHints.build, mode: 'agent' as AgentMode }
				];
		return list;
	});
	const currentAgentName = $derived(agent.currentAgent());

	const running = $derived(agent.runStatus === 'running' || agent.runStatus === 'queued');
	/* * project panels: the rail shows only this project's Sessions */
	const visibleSessions = $derived(
		project ? agent.sessions.filter((x) => x.project === project) : agent.sessions
	);
	// entering the editor auto-focuses the component's most recent development Session
	$effect(() => {
		if (!project) return;
		const list = agent.sessions.filter((x) => x.project === project);
		if (!list.length) return;
		if (agent.activeSession?.project !== project) void agent.selectSession(list[0].id);
	});
	const contextWindow = $derived(
		agent.models.find((m) => m.id === (agent.activeSession?.modelRowId ?? preferredModel()))
			?.contextWindow ??
			agent.models.find((m) => m.isDefault)?.contextWindow ??
			null
	);
	const meterPct = $derived(
		contextWindow ? Math.round((agent.lastRunTokens / contextWindow) * 100) : 0
	);
	const toolSig = $derived(
		agent.items
			.filter((x) => x.kind === 'tool')
			.map((x) => (x.kind === 'tool' ? `${x.id}:${x.state}` : ''))
			.join('|')
	);

	/* entrance animation: freshly rendered [data-fx] nodes animate once only */
	$effect(() => {
		const n = agent.items.length;
		void n;
		if (!listEl) return;
		void tick().then(() => {
			for (const el of listEl!.querySelectorAll<HTMLElement>('[data-fx]')) {
				if (el.dataset.animated) continue;
				el.dataset.animated = '1';
				if (!prefersReduced()) {
					gsap.from(el, {
						autoAlpha: 0,
						y: 10,
						duration: 0.26,
						ease: 'power2.out',
						clearProps: 'transform,opacity,visibility'
					});
				}
			}
			listEl!.scrollTop = listEl!.scrollHeight;
		});
	});

	/* sidebar Session row entrance (stagger on expand or list change) */
	$effect(() => {
		const v = sessionsView;
		if (!v || prefersReduced()) return;
		void tick().then(() => {
			const page = document.querySelector<HTMLElement>('[data-sess-page]');
			if (page)
				gsap.fromTo(
					page,
					{ autoAlpha: 0, y: 10 },
					{
						autoAlpha: 1,
						y: 0,
						duration: 0.22,
						ease: 'power2.out',
						clearProps: 'all',
						overwrite: true
					}
				);
			const rows = page?.querySelectorAll<HTMLElement>('.sessions .row');
			if (rows && rows.length)
				gsap.fromTo(
					rows,
					{ autoAlpha: 0, y: 8 },
					{
						autoAlpha: 1,
						y: 0,
						duration: 0.24,
						delay: 0.06,
						stagger: 0.03,
						ease: 'power2.out',
						clearProps: 'all',
						overwrite: true
					}
				);
		});
	});

	/* expanding a tool result → GSAP height expansion (lost in P37, restored in P38.1) */
	$effect(() => {
		const id = expandedTool;
		if (id == null || !listEl || prefersReduced()) return;
		void tick().then(() => {
			const el = listEl?.querySelector<HTMLElement>(`[data-res="${id}"]`);
			if (el)
				gsap.fromTo(
					el,
					{ height: 0, opacity: 0, y: -4 },
					{
						height: 'auto',
						opacity: 1,
						y: 0,
						duration: 0.3,
						ease: 'power3.out',
						clearProps: 'height,opacity,visibility,transform',
						overwrite: true
					}
				);
		});
	});

	/* tool status flip → icon bounce */
	let prevSig = '';
	$effect(() => {
		const sig = toolSig;
		if (prevSig && sig !== prevSig && listEl && !prefersReduced()) {
			const changed = sig
				.split('|')
				.filter((part) => !prevSig.split('|').includes(part))
				.map((part) => part.split(':')[0]);
			for (const id of changed) {
				const ic = listEl.querySelector<HTMLElement>(`[data-fx="t${id}"] .ic`);
				if (ic)
					gsap.fromTo(
						ic,
						{ scale: 0.4 },
						{ scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'transform' }
					);
			}
		}
		prevSig = sig;
	});

	/* new approval card → gentle shake hint */
	let prevApprovals = 0;
	$effect(() => {
		const pend = agent.items.filter((x) => x.kind === 'approval' && x.state === 'pending').length;
		if (pend > prevApprovals && listEl && !prefersReduced()) {
			const card = listEl.querySelector<HTMLElement>('.approval[data-st="pending"]:last-of-type');
			if (card) {
				gsap.fromTo(
					card,
					{ x: 0 },
					{ x: 6, duration: 0.08, repeat: 5, yoyo: true, ease: 'power1.inOut', clearProps: 'x' }
				);
			}
		}
		prevApprovals = pend;
	});

	function send(): void {
		const text = input;
		input = '';
		grow();
		void (async () => {
			if (project && agent.activeSession?.project !== project) {
				// project panels: never reuse another project's session — open and use immediately
				const sid = await agent.newSession(undefined, project);
				await agent.send(text, sid ?? undefined);
			} else {
				await agent.send(text);
			}
		})();
	}
	function onEnterKey(e: KeyboardEvent): void {
		// Enter during IME composition selects candidates — it isn't a submit
		if (e.isComposing) return;
		// Phase 29.5: Enter = newline; ⌘/Ctrl+Enter = submit (the ➤ button works too)
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			send();
		}
	}
	function grow(): void {
		void tick().then(() => {
			if (!composerEl) return;
			composerEl.style.height = 'auto';
			composerEl.style.height = Math.min(composerEl.scrollHeight, 150) + 'px';
		});
	}
	let copiedId = $state<number | null>(null);
	async function copyText(id: number, text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			copiedId = id;
			setTimeout(() => {
				if (copiedId === id) copiedId = null;
			}, 1500);
		} catch {
			/* clipboard denied */
		}
	}

	function decide(approvalId: string, approve: boolean, always = false): void {
		void agent.decide(approvalId, approve, always);
	}
	function startEdit(id: string, title: string): void {
		editingId = id;
		editTitle = title;
	}
	async function commitEdit(): Promise<void> {
		if (editingId && editTitle.trim()) await agent.rename(editingId, editTitle.trim());
		editingId = null;
	}
	function itemKey(it: ChatItem): string {
		return `${it.kind}:${it.id}`;
	}
	function stepIcon(s: string): string {
		return s === 'done'
			? '✓'
			: s === 'active'
				? '→'
				: s === 'failed'
					? '✗'
					: s === 'skipped'
						? '−'
						: '○';
	}
	function planPct(steps: { status: string }[]): number {
		if (!steps.length) return 0;
		const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
		return Math.round((done / steps.length) * 100);
	}
	function prettyArgs(a: unknown): string {
		if (a == null) return '（無）';
		try {
			return JSON.stringify(typeof a === 'string' ? JSON.parse(a) : a, null, 1);
		} catch {
			return String(a);
		}
	}
	function timeAgo(ts: number): string {
		const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
		if (m < 1) return '剛剛';
		if (m < 60) return `${m} 分`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h} 時`;
		return `${Math.round(h / 24)} 天`;
	}
</script>

<div class="panel {embedded ? 'full' : ''}">
	{#if sessionsView}
		<div class="sess-page" data-sess-page>
			<header class="sp-head">
				<button type="button" class="back" onclick={closeSessions}>← 返回</button>
				<span class="sp-title"
					>Session{project ? `・${project.replace(/^component:/, '')}` : ''}</span
				>
				<span class="grow"></span>
				<button
					type="button"
					class="new"
					onclick={() => {
						void agent.newSession(undefined, project);
						closeSessions();
					}}>＋ 新 Session</button
				>
			</header>
			<div class="sessions" bind:this={railEl}>
				{#if !agent.ready}
					{#each [0, 1, 2] as i (i)}
						<div class="skel-row"><i class="skel" style="width:{70 - i * 12}%"></i></div>
					{/each}
				{/if}
				{#each visibleSessions as s (s.id)}
					<div class="row" class:active={s.id === agent.activeId}>
						{#if editingId === s.id}
							<input
								class="rename"
								bind:value={editTitle}
								onkeydown={(e) => {
									if (!e.isComposing && e.key === 'Enter') void commitEdit();
								}}
								onblur={() => void commitEdit()}
							/>
						{:else}
							<button
								class="pick"
								onclick={() => pickSession(s.id)}
								ondblclick={() => {
									clearTimeout(sessCloseTimer);
									startEdit(s.id, s.title || '（未命名）');
								}}
								title="雙擊更名"
							>
								<span class="t">{s.title || '（未命名）'}</span>
								<span class="m"
									>{s.mode}・{timeAgo(s.updatedAt)}{#if !project && s.project}<span class="proj"
											>{s.project.replace(/^component:/, '⌁ ')}</span
										>{/if}</span
								>
							</button>
							<button
								class="del"
								class:armed={confirmDel === s.id}
								title={confirmDel === s.id ? '再點一次確認刪除' : '刪除'}
								onclick={() => askDel(s.id)}>{confirmDel === s.id ? '確定?' : '×'}</button
							>
						{/if}
					</div>
				{:else}
					<p class="hint">
						{project ? '此元件尚無開發 Session — 發第一句話即建立。' : '尚無 Session。'}
					</p>
				{/each}
			</div>
		</div>
	{/if}

	<section class="main">
		<header class="bar">
			<button
				class="fold"
				type="button"
				title="Sessions"
				class:on={sessionsView}
				disabled={sessionsView}
				onclick={toggleSessions}>☰</button
			>
			{#if embedded}
				<button type="button" class="sess-open" onclick={toggleSessions} title="切換 Session">
					{(
						visibleSessions.find((v) => v.id === agent.activeId)?.title ||
						(agent.activeId ? '目前 Session' : '尚無 Session')
					).slice(0, 24)}
				</button>
			{/if}
			<div class="seg" role="radiogroup" aria-label="Agent">
				{#each agentSeg as m (m.id)}
					<button
						class:m-active={currentAgentName === m.id}
						title={m.hint}
						role="radio"
						aria-checked={currentAgentName === m.id}
						onclick={() => void agent.setAgent(m.id)}>{m.label}</button
					>
				{/each}
			</div>
			{#if agent.models.length > 1}
				<select
					class="model"
					value={agent.activeSession?.modelRowId ?? ''}
					onchange={(e) => void agent.setModel((e.target as HTMLSelectElement).value)}
				>
					<option value="">預設路由</option>
					{#each agent.models as m (m.id)}
						<option value={m.id}>{m.name}</option>
					{/each}
				</select>
			{/if}
			{#if contextWindow}
				<span
					class="meter"
					class:warn={meterPct >= 80}
					title={`最近 run：輸入 ${agent.lastRunUsage?.inputs.toLocaleString() ?? '?'} ・輸出 ${agent.lastRunUsage?.outputs.toLocaleString() ?? '?'} ・上下文約 ${agent.lastRunTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`}
				>
					<i style="width:{Math.min(meterPct, 100)}%"></i>
					<b>{meterPct}%</b>
				</span>
			{/if}
			<button
				class="fold"
				title="手動壓縮上下文（保留最近對話）"
				disabled={agent.busy || !agent.activeId}
				onclick={() => void agent.compact()}
			>
				⟲
			</button>
			<span class="status" data-s={agent.runStatus}>
				{#if running}● 執行中{:else if agent.runStatus === 'waiting_approval'}▲ 待批{:else if agent.runStatus === 'waiting_client'}◐
					等瀏覽器{:else}○ 待機{/if}
			</span>
			{#if !embedded}
				<button class="fold" title="收合" onclick={() => agent.setOpen(false)}>✕</button>
			{/if}
		</header>

		{#if agent.stalledRun && !agent.busy}
			<div class="stall-bar" role="alert">
				<span>上一個 run 沒有回應（可能已中斷）</span>
				<button type="button" class="rb" onclick={() => void agent.resumeStalled()}
					>⟳ 繼續執行</button
				>
				<button type="button" class="cb" onclick={() => void agent.cancel()}>✕ 強制取消</button>
			</div>
		{/if}
		<div class="flow" bind:this={listEl} role="log" aria-live="polite">
			{#if !agent.ready}
				<div class="skel-chat" aria-label="Session 載入中">
					{#each [0, 1] as i (i)}
						<div class="skel-b"><i class="skel" style="width:{66 - i * 22}%"></i></div>
					{/each}
				</div>
			{:else if agent.items.length === 0 && !agent.thinking}
				<div class="empty" data-fx="empty">
					<p class="big">✦ Agentic Coding Agent</p>
					<p class="sub">
						不是聊天機器人——會調查、規畫、呼叫工具、驗證、出錯自修，高風險等你批准。
					</p>
					<div class="mode-cards">
						{#each agentSeg as m (m.id)}
							<button
								class="mc"
								class:now={currentAgentName === m.id}
								onclick={() => void agent.setAgent(m.id)}
							>
								<strong>{m.label}</strong>
								<span>{m.hint}</span>
							</button>
						{/each}
					</div>
					<ul>
						<li>「幫所有缺英文翻譯的文章補上翻譯」</li>
						<li>「搜尋提到 GSAP 的文章，整理成一篇新草稿」</li>
						<li>（Workshop 選中元件後）「hover 太普通，幫我做得更有質感」</li>
					</ul>
					{#if agent.lastError}<p class="err">{agent.lastError}</p>{/if}
				</div>
			{/if}
			{#each agent.items as it (itemKey(it))}
				{#if it.kind === 'user'}
					<div class="msg user" data-fx="u{it.id}">
						<span class="who">你</span>
						<div class="body">{it.text}</div>
						<button
							class="cp"
							class:ok={copiedId === it.id}
							title="複製"
							onclick={() => void copyText(it.id, it.text)}>{copiedId === it.id ? '✓' : '⧉'}</button
						>
					</div>
				{:else if it.kind === 'reasoning'}
					<div class="think" class:open={it.expanded} data-fx="r{it.id}">
						<button
							class="th"
							onclick={() => agent.toggleReasoning(it.id)}
							aria-expanded={it.expanded}
						>
							<span class="ti">{it.expanded ? '▾' : '▸'}</span>
							<span>Thinking{it.running ? '…' : ''}</span>
							<span class="tc">{it.text.length} chars</span>
						</button>
						{#if it.expanded}
							<div class="tb">{it.text}</div>
						{/if}
					</div>
				{:else if it.kind === 'assistant'}
					<div class="msg bot" data-fx="a{it.id}">
						<span class="who">✦ Agent</span>
						<!-- svelte-escape: miniMd escapes everything first, then pattern-replaces — input can never become HTML -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="body md">{@html miniMd(it.text)}</div>
						<button
							class="cp"
							class:ok={copiedId === it.id}
							title="複製"
							onclick={() => void copyText(it.id, it.text)}>{copiedId === it.id ? '✓' : '⧉'}</button
						>
					</div>
				{:else if it.kind === 'tool'}
					<div class="tl">
						<i class="dot" data-st={it.state}></i>
						<button
							class="tool"
							data-st={it.state}
							data-fx="t{it.id}"
							onclick={() => {
								expandedTool = expandedTool === it.id ? null : it.id;
								if (expandedTool === it.id) void agent.loadToolDetail(it.id);
							}}
						>
							<span class="ic"
								>{it.state === 'running'
									? '◌'
									: it.state === 'ok'
										? '✓'
										: it.state === 'denied'
											? '⊘'
											: '✗'}</span
							>
							<span class="nm">{it.name}</span>
							<span class="rk" data-r={it.risk}>{it.risk}</span>
							<span class="sm">{it.summary}</span>
							<span class="cx">{expandedTool === it.id ? '▴' : '▾'}</span>
						</button>
					</div>
					{#if expandedTool === it.id && (it.preview || it.full)}
						<div class="result" data-res={it.id}>
							<div class="rs">
								<h5>輸入參數</h5>
								<pre>{it.fullLoading && !it.full ? '（載入中…）' : prettyArgs(it.full?.args)}</pre>
							</div>
							<div class="rs">
								<h5>結果{it.fullLoading ? '（載入中…）' : ''}</h5>
								<pre>{it.full?.result ?? it.preview}</pre>
							</div>
						</div>
					{/if}
				{:else if it.kind === 'plan'}
					<div class="plan" data-fx="p{it.id}">
						<div class="ph">
							<p class="pt">🗒 {it.title || '計畫'}</p>
							<span class="pct">{planPct(it.steps)}%</span>
						</div>
						<div class="prog"><i style="width:{planPct(it.steps)}%"></i></div>
						<ol>
							{#each it.steps as st (st.ordinal)}
								<li data-st={st.status}><i>{stepIcon(st.status)}</i> {st.label}</li>
							{/each}
						</ol>
					</div>
				{:else if it.kind === 'approval'}
					<div class="approval" data-st={it.state} data-fx="ap{it.id}">
						<div class="ah">
							<span class="rk" data-r={it.risk}>{it.risk}</span>
							<strong>需要核准</strong>
							<span class="an">{it.name}</span>
						</div>
						<p class="as">{it.summary}</p>
						{#if it.argsPreview}
							<details class="ap-detail">
								<summary>參數明細</summary>
								<pre class="ap-args">{(() => {
										try {
											return JSON.stringify(JSON.parse(it.argsPreview), null, 1).slice(0, 1200);
										} catch {
											return it.argsPreview.slice(0, 1200);
										}
									})()}</pre>
							</details>
						{/if}
						{#if it.state === 'pending'}
							<div class="ab">
								<button class="no" onclick={() => decide(it.approvalId, false)}>拒絕</button>
								<button
									class="go alw"
									title="批准此項並記住：本 Session 後續同工具免再審批"
									onclick={() => decide(it.approvalId, true, true)}>批准並記住</button
								>
								<button class="go" onclick={() => decide(it.approvalId, true)}>批准</button>
							</div>
						{:else}
							<p class="ad">{it.state === 'approved' ? '✓ 已批准' : '⊘ 已拒絕'}</p>
						{/if}
					</div>
				{:else if it.kind === 'notice'}
					<p class="notice" data-tone={it.tone} data-fx="n{it.id}">{it.text}</p>
				{/if}
			{/each}
			{#if agent.thinking}
				<div class="thinking" aria-label="Agent 執行中">
					{#each [0, 1, 2] as i (i)}
						<i class="tdot" data-i={i}></i>
					{/each}
					<span>{running ? '執行中…' : '思考中…'}</span>
				</div>
			{/if}
		</div>

		{#if (agent.runStatus === 'failed' || agent.lastError) && !agent.busy}
			<div class="retry-bar">
				<span>上一次執行未成功</span>
				<span class="grow"></span>
				<button type="button" class="rt" onclick={() => void agent.retryLast()}>↻ 重試上一則</button
				>
			</div>
		{/if}
		<footer class="composer">
			{#if running && !agent.busy}
				<button class="cancel" onclick={() => void agent.cancel()}>■ 取消 Run</button>
			{/if}
			<div class="inrow">
				<textarea
					rows="1"
					placeholder="交給 Agent…（Enter 換行・⌘/Ctrl+Enter 送出）"
					bind:this={composerEl}
					bind:value={input}
					disabled={agent.busy}
					onkeydown={onEnterKey}
					oninput={grow}></textarea>
				<button
					class="send"
					class:idle={!input.trim() || agent.busy}
					disabled={agent.busy || !input.trim()}
					onclick={send}
					aria-label="送出"
				>
					➤
				</button>
			</div>
		</footer>
	</section>
</div>

<style>
	.msg .cp {
		position: absolute;
		top: 0.15rem;
		right: 0.25rem;
		border: none;
		background: color-mix(in srgb, var(--color-ink) 7%, transparent);
		color: var(--color-ink-muted);
		border-radius: 0.35rem;
		font-size: 0.66rem;
		padding: 0.05rem 0.3rem;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.msg:hover .cp {
		opacity: 1;
	}
	.cp.ok {
		color: #16a34a;
		opacity: 1;
	}
	.ap-detail {
		margin-top: 0.25rem;
		font-size: 0.7rem;
	}
	.ap-detail summary {
		cursor: pointer;
		color: var(--color-ink-muted);
	}
	.ap-args {
		max-height: 160px;
		overflow: auto;
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.66rem;
	}
	.retry-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.7rem;
		margin: 0 0.6rem 0.15rem;
		border: 1px solid color-mix(in srgb, #e5484d 35%, transparent);
		border-radius: 0.5rem;
		font-size: 0.72rem;
	}
	.retry-bar .rt {
		border: 1px solid var(--color-accent);
		background: none;
		color: var(--color-accent);
		border-radius: 0.4rem;
		padding: 0.1rem 0.5rem;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.stall-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.7rem;
		margin: 0.3rem 0.6rem 0;
		border: 1px solid color-mix(in srgb, #f59e0b 45%, transparent);
		border-radius: 0.55rem;
		background: color-mix(in srgb, #f59e0b 10%, transparent);
		font-size: 0.74rem;
	}
	.stall-bar .rb,
	.stall-bar .cb {
		border-radius: 0.4rem;
		padding: 0.15rem 0.5rem;
		font-size: 0.72rem;
		cursor: pointer;
		border: 1px solid var(--color-line);
		background: var(--color-bg-elevated, transparent);
		color: inherit;
	}
	.stall-bar .cb {
		border-color: color-mix(in srgb, #e5484d 55%, transparent);
	}
	.panel {
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--color-bg);
		color: var(--color-ink);
	}
	.panel.full {
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		overflow: hidden;
	}

	/* ---- Session paging (Phase 38: overlay style, no more height growth) ---- */
	.sess-page {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		background: var(--color-bg-elevated);
	}
	.sp-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.65rem;
		border-bottom: 1px solid var(--color-line);
	}
	.sp-head .sp-title {
		font-size: 0.82rem;
		font-weight: 600;
	}
	.sp-head .back {
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink);
		border-radius: 0.5rem;
		padding: 0.3rem 0.6rem;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.sp-head .new {
		padding: 0.32rem 0.6rem;
		font-size: 0.74rem;
	}
	.sp-head .grow {
		flex: 1;
	}
	.sess-open {
		border: 1px solid var(--color-line);
		background: transparent;
		color: var(--color-ink-muted);
		border-radius: 0.5rem;
		padding: 0.3rem 0.55rem;
		font-size: 0.74rem;
		cursor: pointer;
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sess-open:hover {
		color: var(--color-ink);
		border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
	}
	.fold.on {
		color: var(--color-accent);
		border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
	}
	.new {
		border: 1px dashed color-mix(in srgb, var(--color-accent) 55%, var(--color-line));
		border-radius: 0.55rem;
		background: transparent;
		color: var(--color-ink);
		padding: 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}
	.new:hover {
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-accent);
	}
	.sessions {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-height: 0;
		flex: 1;
		padding: 0.65rem;
	}
	.row {
		display: flex;
		align-items: stretch;
		gap: 0.15rem;
		border-radius: 0.55rem;
		transition: background-color 0.15s;
	}
	.row.active {
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
	.pick {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		background: none;
		border: 0;
		color: inherit;
		padding: 0.45rem 0.55rem;
		cursor: pointer;
		text-align: left;
		min-width: 0;
	}
	.pick .t {
		font-size: 0.78rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.pick .m {
		font-size: 0.64rem;
		opacity: 0.55;
	}
	.del.armed {
		background: color-mix(in srgb, #e5484d 78%, transparent);
		color: #fff;
		width: auto;
		padding: 0 0.4rem;
		opacity: 1;
	}
	.skel {
		display: block;
		height: 0.75rem;
		border-radius: 0.4rem;
		background: linear-gradient(
			90deg,
			var(--color-line) 25%,
			color-mix(in srgb, var(--color-line) 40%, var(--color-bg)) 50%,
			var(--color-line) 75%
		);
		background-size: 200% 100%;
		animation: mm-shimmer 1.15s linear infinite;
	}
	.skel-row {
		padding: 0.55rem 0.6rem;
	}
	.skel-chat {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 0.6rem 0.2rem;
	}
	.skel-b {
		height: 1.1rem;
	}
	@keyframes mm-shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skel {
			animation: none;
		}
	}
	.del {
		border: 0;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		padding: 0 0.4rem;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.row:hover .del {
		opacity: 0.7;
	}
	.del:hover {
		opacity: 1 !important;
		color: #d33;
	}
	.rename {
		flex: 1;
		font-size: 0.78rem;
		padding: 0.45rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.45rem;
		background: var(--color-bg);
		color: inherit;
		min-width: 0;
	}
	.hint {
		font-size: 0.72rem;
		opacity: 0.55;
		padding: 0.4rem;
	}

	/* ---- main column ---- */
	.main {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}
	.bar {
		flex-wrap: wrap;
		row-gap: 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.5rem 0.7rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-bg-elevated);
	}
	.fold {
		border: 0;
		background: none;
		color: var(--color-ink-muted);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0.2rem 0.4rem;
	}
	.fold:hover {
		color: var(--color-ink);
	}

	.seg {
		flex-wrap: wrap;
		min-width: 0;
		display: flex;
		border: 1px solid var(--color-line);
		border-radius: 0.55rem;
		overflow: hidden;
		background: var(--color-bg);
	}
	.seg button {
		border: 0;
		background: none;
		color: var(--color-ink-muted);
		font-size: 0.72rem;
		padding: 0.3rem 0.65rem;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}
	.seg button:hover {
		color: var(--color-ink);
	}
	.seg button.m-active {
		background: var(--color-accent);
		color: var(--color-accent-ink, #fff);
	}
	.model {
		font-size: 0.68rem;
		max-width: 9.5rem;
		padding: 0.25rem 1.6rem 0.25rem 0.45rem;
	}
	.status {
		margin-left: auto;
		font-size: 0.7rem;
		opacity: 0.8;
		white-space: nowrap;
	}
	.status[data-s='running'] {
		color: #2a9d4a;
	}
	.status[data-s='waiting_approval'] {
		color: #c07a1f;
	}
	.status[data-s='failed'] {
		color: #c33;
	}

	/* ---- message stream ---- */
	.flow {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.9rem 0.9rem 1rem;
		min-height: 0;
		font-size: 0.84rem;
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--color-ink) 22%, transparent) transparent;
	}
	.flow::-webkit-scrollbar {
		width: 8px;
	}
	.flow::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--color-ink) 20%, transparent);
		border-radius: 8px;
	}

	.empty {
		margin: auto;
		max-width: 27rem;
		text-align: center;
		line-height: 1.65;
		opacity: 0.92;
	}
	.empty .big {
		font-size: 1.25rem;
		font-family: var(--font-display);
		margin: 0;
	}
	.empty .sub {
		font-size: 0.78rem;
		color: var(--color-ink-muted);
		margin: 0.35rem 0 0.9rem;
	}
	.mode-cards {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.45rem;
		margin-bottom: 0.9rem;
	}
	.mc {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		border: 1px solid var(--color-line);
		border-radius: 0.65rem;
		background: var(--color-bg-elevated);
		color: inherit;
		padding: 0.55rem 0.4rem;
		cursor: pointer;
		text-align: center;
		transition:
			border-color 0.15s,
			background-color 0.15s;
	}
	.mc strong {
		font-size: 0.78rem;
	}
	.mc span {
		font-size: 0.62rem;
		color: var(--color-ink-muted);
		line-height: 1.35;
	}
	.mc:hover {
		border-color: var(--color-accent);
	}
	.mc.now {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-elevated));
	}
	.empty ul {
		text-align: left;
		font-size: 0.73rem;
		color: var(--color-ink-muted);
		margin: 0;
		padding-left: 1.2rem;
	}
	.err {
		color: #c33;
		font-size: 0.74rem;
	}

	.msg {
		position: relative;
		max-width: 88%;
		align-self: flex-start;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.msg.user {
		align-self: flex-end;
		align-items: flex-end;
	}
	.msg .who {
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		color: var(--color-ink-muted);
		padding: 0 0.35rem;
	}
	.msg .body {
		overflow-wrap: anywhere;
		padding: 0.55rem 0.8rem;
		border-radius: 0.85rem;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.msg.user .body {
		background: color-mix(in srgb, var(--color-accent) 13%, var(--color-bg-elevated));
		border: 1px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
		border-bottom-right-radius: 0.25rem;
	}
	.msg.bot .body {
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-bottom-left-radius: 0.25rem;
	}
	.think {
		align-self: flex-start;
		max-width: 88%;
		border: 1px dashed color-mix(in srgb, var(--color-ink-muted) 45%, transparent);
		border-radius: 0.7rem;
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
		overflow: hidden;
	}
	.think .th {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		border: 0;
		background: none;
		color: var(--color-ink-muted);
		font-size: 0.7rem;
		padding: 0.38rem 0.6rem;
		cursor: pointer;
		text-align: left;
	}
	.think .th:hover {
		color: var(--color-ink);
	}
	.think .ti {
		width: 0.9em;
	}
	.think .tc {
		margin-left: auto;
		opacity: 0.6;
		font-variant-numeric: tabular-nums;
	}
	.think .tb {
		max-height: 11rem;
		overflow-y: auto;
		padding: 0.1rem 0.7rem 0.6rem;
		font-size: 0.72rem;
		line-height: 1.55;
		font-style: italic;
		color: var(--color-ink-muted);
		white-space: pre-wrap;
		word-break: break-word;
		scrollbar-width: thin;
	}
	.meter {
		position: relative;
		width: 3.6rem;
		height: 0.85rem;
		border: 1px solid var(--color-line);
		border-radius: 0.45rem;
		overflow: hidden;
		background: var(--color-bg);
		flex: none;
	}
	.meter i {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in srgb, var(--color-accent) 55%, transparent);
		transition: width 0.4s ease;
	}
	.meter.warn i {
		background: #c07a1f99;
	}
	.meter b {
		position: relative;
		font-size: 0.56rem;
		font-weight: 600;
		display: grid;
		place-content: center;
		height: 100%;
		color: var(--color-ink-muted);
	}
	.compact-btn {
		font-size: 0.9rem;
	}
	.compact-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.proj {
		margin-left: 0.35rem;
		border: 1px solid var(--color-line);
		border-radius: 0.3rem;
		padding: 0 0.25rem;
		font-size: 0.58rem;
		color: var(--color-accent);
	}
	.thinking {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.7rem;
		color: var(--color-ink-muted);
		padding: 0 0.3rem;
	}
	.tdot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--color-accent);
		display: inline-block;
	}
	.tdot:nth-child(1) {
		animation: bnc 1s ease-in-out infinite;
	}
	.tdot:nth-child(2) {
		animation: bnc 1s ease-in-out 0.15s infinite;
	}
	.tdot:nth-child(3) {
		animation: bnc 1s ease-in-out 0.3s infinite;
	}
	@keyframes bnc {
		0%,
		60%,
		100% {
			transform: none;
			opacity: 0.5;
		}
		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}

	/* ---- tool timeline ---- */
	.tl {
		display: flex;
		align-items: stretch;
		gap: 0.45rem;
	}
	.tl .dot {
		width: 0.55rem;
		flex: none;
		margin-top: 0.55rem;
		align-self: flex-start;
		position: relative;
	}
	.tl .dot::before {
		content: '';
		position: absolute;
		inset: 0 auto auto 50%;
		width: 0.55rem;
		height: 0.55rem;
		margin-left: -0.27rem;
		border-radius: 50%;
		border: 2px solid var(--color-line);
		background: var(--color-bg);
	}
	.tl .dot[data-st='ok']::before {
		background: #2a9d4a;
		border-color: #2a9d4a;
	}
	.tl .dot[data-st='fail']::before,
	.tl .dot[data-st='denied']::before {
		background: #c33;
		border-color: #c33;
	}
	.tl .dot[data-st='running']::before {
		border-color: var(--color-accent);
		animation: bpulse 1s ease-in-out infinite;
	}
	@keyframes bpulse {
		50% {
			box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 22%, transparent);
		}
	}
	.tool {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid var(--color-line);
		border-radius: 0.6rem;
		background: var(--color-bg-elevated);
		color: inherit;
		font-size: 0.72rem;
		padding: 0.4rem 0.6rem;
		cursor: pointer;
		text-align: left;
	}
	.tool .ic {
		width: 1em;
		display: inline-block;
	}
	.tool[data-st='running'] .ic {
		animation: spin 1.1s linear infinite;
	}
	.tool[data-st='ok'] .ic {
		color: #2a9d4a;
	}
	.tool[data-st='fail'] .ic {
		color: #c33;
	}
	.tool .nm {
		font-weight: 650;
	}
	.tool .sm {
		margin-left: auto;
		opacity: 0.6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 45%;
	}
	.tool .cx {
		opacity: 0.4;
		font-size: 0.6rem;
	}
	.rk {
		font-size: 0.58rem;
		border-radius: 0.3rem;
		padding: 0.06rem 0.32rem;
		border: 1px solid var(--color-line);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-ink-muted);
	}
	.rk[data-r='low'] {
		border-color: #2a9d4a66;
		color: #2a9d4a;
	}
	.rk[data-r='medium'] {
		border-color: #c07a1f66;
		color: #c07a1f;
	}
	.rk[data-r='high'],
	.rk[data-r='critical'] {
		border-color: #c336;
		color: #c33;
	}
	.result {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-height: 7rem;
		margin: -0.2rem 0 0 1rem;
		font-size: 0.65rem;
		background: var(--color-bg-elevated);
		border: 1px dashed var(--color-line);
		border-radius: 0.55rem;
		padding: 0.45rem 0.65rem;
		max-height: 30rem;
		overflow: auto;
	}
	.result .rs h5 {
		margin: 0 0 0.15rem;
		font-size: 0.6rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-muted);
		font-weight: 600;
	}
	.result .rs pre {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-all;
		max-height: 12rem;
		overflow: auto;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ---- plan ---- */
	.plan {
		align-self: stretch;
		border: 1px solid var(--color-line);
		border-radius: 0.7rem;
		padding: 0.6rem 0.8rem;
		background: var(--color-bg-elevated);
	}
	.ph {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.plan .pt {
		margin: 0;
		font-weight: 700;
		font-size: 0.76rem;
		font-family: var(--font-display);
	}
	.pct {
		font-size: 0.66rem;
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
	}
	.prog {
		height: 3px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--color-ink) 10%, transparent);
		margin: 0.45rem 0 0.4rem;
		overflow: hidden;
	}
	.prog i {
		display: block;
		height: 100%;
		background: var(--color-accent);
		border-radius: 3px;
		transition: width 0.4s ease;
	}
	.plan ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		font-size: 0.75rem;
	}
	.plan li {
		display: flex;
		gap: 0.45rem;
		opacity: 0.85;
	}
	.plan li i {
		font-style: normal;
		width: 1em;
		text-align: center;
	}
	.plan li[data-st='done'] {
		color: #2a9d4a;
	}
	.plan li[data-st='active'] {
		color: var(--color-accent);
		font-weight: 600;
	}
	.plan li[data-st='failed'] {
		color: #c33;
	}

	/* ---- approvals ---- */
	.approval {
		align-self: stretch;
		border: 1px solid color-mix(in srgb, #c07a1f 55%, var(--color-line));
		border-left: 3px solid #c07a1f;
		border-radius: 0.7rem;
		padding: 0.6rem 0.8rem;
		background: color-mix(in srgb, #c07a1f 7%, var(--color-bg-elevated));
	}
	.approval[data-st='approved'],
	.approval[data-st='rejected'] {
		border-left-color: var(--color-line);
		border-color: var(--color-line);
		background: var(--color-bg-elevated);
		opacity: 0.8;
	}
	.ah {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
	}
	.ah .an {
		font-weight: 600;
	}
	.as {
		margin: 0.32rem 0 0;
		font-size: 0.74rem;
		opacity: 0.85;
	}
	.ab {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.55rem;
	}
	.ab button {
		border-radius: 0.5rem;
		padding: 0.34rem 1.05rem;
		font-size: 0.76rem;
		cursor: pointer;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		color: inherit;
		transition:
			transform 0.1s,
			box-shadow 0.15s;
	}
	.ab button:active {
		transform: scale(0.96);
	}
	.ab .go {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-ink, #fff);
		box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent) 40%, transparent);
		animation: glow 1.6s ease-in-out infinite;
	}
	@keyframes glow {
		50% {
			box-shadow: 0 0 0 5px transparent;
		}
	}
	.ab .no:hover {
		border-color: #c33;
		color: #c33;
	}
	.ad {
		margin: 0.38rem 0 0;
		font-size: 0.7rem;
		opacity: 0.7;
	}

	.notice {
		align-self: center;
		font-size: 0.7rem;
		opacity: 0.7;
		margin: 0.15rem 0;
	}
	.notice[data-tone='error'] {
		color: #c33;
		opacity: 1;
	}
	.notice[data-tone='warn'] {
		color: #c07a1f;
		opacity: 1;
	}

	/* ---- input bar ---- */
	.composer {
		border-top: 1px solid var(--color-line);
		padding: 0.55rem 0.7rem 0.75rem;
		background: var(--color-bg-elevated);
	}
	.cancel {
		border: 1px solid #c33;
		color: #c33;
		background: none;
		border-radius: 0.45rem;
		font-size: 0.7rem;
		padding: 0.18rem 0.55rem;
		cursor: pointer;
		margin-bottom: 0.4rem;
	}
	.inrow {
		display: flex;
		gap: 0.45rem;
		align-items: flex-end;
	}
	textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--color-line);
		border-radius: 0.9rem 0.9rem 0.9rem 0.25rem;
		background: var(--color-bg);
		color: inherit;
		font: inherit;
		font-size: 0.82rem;
		padding: 0.55rem 0.75rem;
		line-height: 1.5;
		max-height: 150px;
	}
	textarea:focus-visible {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 20%, transparent);
	}
	.send {
		border: 0;
		border-radius: 50%;
		width: 2.3rem;
		height: 2.3rem;
		flex: none;
		background: var(--color-accent);
		color: var(--color-accent-ink, #fff);
		font-size: 0.9rem;
		cursor: pointer;
		display: grid;
		place-content: center;
		transition:
			opacity 0.15s,
			transform 0.12s;
	}
	.send:active {
		transform: scale(0.92);
	}
	.send.idle {
		opacity: 0.35;
	}
	.send:disabled {
		cursor: default;
	}

	.md :global(.mm-p) {
		margin: 0 0 0.28rem;
		line-height: 1.65;
	}
	.md :global(.mm-p:last-child) {
		margin-bottom: 0;
	}
	.md :global(.mm-ul) {
		margin: 0.2rem 0 0.4rem;
		padding-left: 1.25rem;
	}
	.md :global(.mm-code) {
		margin: 0.3rem 0;
		padding: 0.5rem 0.6rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
		overflow-x: auto;
		font-size: 0.76rem;
		line-height: 1.55;
	}
	.md :global(.mm-hr) {
		border: none;
		border-top: 1px solid var(--color-line);
		margin: 0.5rem 0;
	}
	.md :global(code) {
		padding: 0.06rem 0.3rem;
		border-radius: 0.32rem;
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
		font-size: 0.85em;
	}
	.md :global(a) {
		color: var(--color-accent);
		text-decoration: underline;
	}
</style>
