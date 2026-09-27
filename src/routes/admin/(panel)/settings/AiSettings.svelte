<script lang="ts">
	/**
	 * AI Layer settings (Phase 18) — provider management / model catalog refresh / capability flags / task routing.
	 * Pure admin tooling: every action POSTs to ?/action then invalidateAll refetches.
	 */
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';

	import {
		CAPABILITIES,
		PROVIDER_TYPES,
		PROVIDER_PRESETS,
		REASONING_EFFORTS,
		TASKS,
		type AiTask,
		type ModelInfo,
		type ProviderInfo
	} from '$lib/ai/adapters';

	let { ai }: { ai: { secretSet: boolean; providers: ProviderInfo[]; models: ModelInfo[] } } =
		$props();

	let message = $state('');
	let busy = $state('');

	let editing = $state<ProviderInfo | 'new' | null>(null);

	/* form fields (shared by create/edit) */
	let fName = $state('');
	let fType = $state('openai');
	let fBaseUrl = $state('');
	let fFamily = $state('');
	let presetId = $state('custom');

	function applyPreset(id: string): void {
		presetId = id;
		const pr = PROVIDER_PRESETS.find((x) => x.id === id);
		if (!pr || id === 'custom') return;
		if (!editing) fName = pr.label;
		fType = pr.type;
		fBaseUrl = pr.baseUrl;
		fFamily = pr.family ?? '';
	}
	let fApiKey = $state('');
	let fEnabled = $state(true);

	function startNew() {
		editing = 'new';
		fName = '';
		fType = 'openai';
		fBaseUrl = '';
		fFamily = '';
		presetId = 'custom';
		fApiKey = '';
		fEnabled = true;
	}
	function startEdit(p: ProviderInfo) {
		editing = p;
		fName = p.name;
		fType = p.type;
		fBaseUrl = p.baseUrl;
		fFamily = p.family ?? '';
		presetId = 'custom';
		fApiKey = '';
		fEnabled = p.enabled;
	}

	function saveCap(m: ModelInfo, e: MouseEvent): void {
		const box = (e.currentTarget as HTMLElement).closest('.capf');
		if (!box) return;
		const ctxEl = box.querySelector('[data-ctx]') as HTMLInputElement | null;
		const ctxNote = box.querySelector('.cap-note') as HTMLElement | null;
		let ctx = ctxEl?.value ?? '';
		const cap = m.apiContextWindow ?? null;
		if (cap && ctx && Number(ctx) > cap) {
			ctx = String(cap);
			if (ctxEl) ctxEl.value = ctx;
			if (ctxNote) ctxNote.textContent = `已封頂至 API 上限 ${cap.toLocaleString()}`;
		} else if (ctxNote) ctxNote.textContent = '';
		const out = (box.querySelector('[data-out]') as HTMLInputElement | null)?.value ?? '';
		const rb = (box.querySelector('[data-rb]') as HTMLInputElement | null)?.value ?? '';
		const eff = (box.querySelector('[data-eff]') as HTMLSelectElement | null)?.value ?? '';
		void run('aiModel', {
			id: m.id,
			providerId: m.providerId,
			modelId: m.modelId,
			label: m.label,
			isDefault: m.isDefault ? 'on' : 'off',
			caps: m.capabilities,
			contextWindow: ctx,
			maxOutputTokens: out,
			reasoningBudget: rb,
			reasoningEffort: eff
		});
	}

	async function run(action: string, fields: Record<string, string | boolean | string[]>) {
		busy = action;
		message = '';
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) {
			if (Array.isArray(v)) for (const item of v) fd.append(k, item);
			else fd.set(k, String(v));
		}
		try {
			const res = await fetch(`/admin/settings?/${action}`, { method: 'POST', body: fd });
			const outcome = deserialize(await res.text()) as {
				type?: string;
				data?: { message?: string };
			};
			const m = outcome?.data?.message ?? '';
			// form action failures return type:'failure' (HTTP still 200/400), not 'error'
			const failed = !res.ok || outcome?.type === 'failure' || outcome?.type === 'error';
			message = failed ? `✗ ${m || `HTTP ${res.status}`}` : `✓ ${m || '完成'}`;
			if (!failed) await invalidateAll();
		} finally {
			busy = '';
		}
	}

	async function saveProvider() {
		if (!fName.trim()) {
			message = '✗ 需要名稱';
			return;
		}
		await run('aiProvider', {
			...(editing && editing !== 'new' ? { id: editing.id } : {}),
			name: fName,
			type: fType,
			baseUrl: fBaseUrl,
			family: fFamily,
			apiKey: fApiKey,
			enabled: fEnabled ? 'on' : 'off'
		});
		if (message.startsWith('✓')) editing = null;
	}

	const modelsOf = (providerId: string) => ai.models.filter((m) => m.providerId === providerId);
	const taskOf = (t: AiTask) => ai.models.find((m) => m.task === t);
</script>

<section class="ai">
	<h2 class="ai-title">AI 層（Providers / Models）</h2>

	{#if !ai.secretSet}
		<p class="warn">
			未設定 <code>AI_SECRET</code>（本機：<code>.dev.vars</code>；正式：<code
				>wrangler secret put AI_SECRET</code
			>）。設定前無法儲存 provider key。
		</p>
	{/if}

	{#if editing}
		<form
			class="pf"
			onsubmit={(e) => {
				e.preventDefault();
				void saveProvider();
			}}
		>
			<span class="pf-title">{editing === 'new' ? '新增 Provider' : `編輯「${editing.name}」`}</span
			>
			<div class="pf-grid">
				<label>名稱 <input type="text" bind:value={fName} placeholder="OpenAI" /></label>
				<label>
					預設目錄
					<select
						value={presetId}
						onchange={(e) => applyPreset((e.target as HTMLSelectElement).value)}
					>
						{#each PROVIDER_PRESETS as pr (pr.id)}
							<option value={pr.id}>{pr.label}</option>
						{/each}
					</select>
				</label>
				<label>
					類型
					<select bind:value={fType}>
						{#each PROVIDER_TYPES as t (t)}
							<option value={t}>{t}</option>
						{/each}
					</select>
				</label>
				<label>
					思考方言
					<select bind:value={fFamily} title="openai-compatible 的 thinking 參數格式">
						<option value="">通用（enable_thinking）</option>
						<option value="deepseek">DeepSeek（thinking.type＋reasoning_effort）</option>
						<option value="dashscope">阿里百煉 DashScope</option>
					</select>
				</label>
				<label>
					Base URL
					<input
						type="text"
						bind:value={fBaseUrl}
						placeholder="https://api.openai.com/v1（openai-compatible 必填）"
					/>
				</label>
				<label>
					API Key（僅儲存時更新）
					<input
						type="password"
						bind:value={fApiKey}
						autocomplete="new-password"
						placeholder={editing !== 'new' && editing.hasKey ? '•••••• 已儲存，留空不覆蓋' : 'sk-…'}
					/>
				</label>
			</div>
			<label class="chk"><input type="checkbox" bind:checked={fEnabled} /> 啟用</label>
			<div class="pf-actions">
				<button type="submit" class="primary" disabled={busy === 'aiProvider'}>儲存</button>
				<button type="button" class="ghost" onclick={() => (editing = null)}>取消</button>
			</div>
		</form>
	{:else}
		<button type="button" class="ghost add" onclick={startNew}>＋ 新增 Provider</button>
	{/if}

	{#each ai.providers as p (p.id)}
		<article class="prov" data-enabled={p.enabled}>
			<header class="prov-head">
				<span class="prov-name">{p.name}</span>
				<span class="chip">{p.type}</span>
				<span class="chip {p.hasKey ? 'ok' : 'bad'}">{p.hasKey ? 'key ✓' : 'key ✗'}</span>
				{#if !p.enabled}<span class="chip">停用中</span>{/if}
				<span class="grow"></span>
				<button
					type="button"
					class="mini"
					onclick={() =>
						run('aiProvider', {
							id: p.id,
							name: p.name,
							type: p.type,
							baseUrl: p.baseUrl,
							enabled: p.enabled ? 'off' : 'on'
						})}
				>
					{p.enabled ? '停用' : '啟用'}
				</button>
				<button type="button" class="mini" onclick={() => startEdit(p)}>編輯</button>
				<button
					type="button"
					class="mini"
					disabled={busy === 'aiRefresh'}
					onclick={() => run('aiRefresh', { id: p.id })}
				>
					測試 & 刷新
				</button>
				<button
					type="button"
					class="mini danger"
					onclick={() => run('aiProviderDelete', { id: p.id })}
				>
					刪除
				</button>
			</header>
			{#if p.baseUrl}<p class="prov-url">{p.baseUrl}</p>{/if}

			<div class="models">
				{#each modelsOf(p.id) as m (m.id)}
					<div class="model" class:def={m.isDefault}>
						<span class="m-id" title={m.label}>{m.modelId}</span>
						{#if m.isDefault}<span class="chip star">預設</span>{/if}
						{#if m.task}<span class="chip task">{m.task} →</span>{/if}
						<span class="grow"></span>
						<span class="caps">
							{#each CAPABILITIES as cap (cap)}
								<label class="cap">
									<input
										type="checkbox"
										checked={m.capabilities.includes(cap)}
										onchange={(e) =>
											run('aiModel', {
												id: m.id,
												providerId: m.providerId,
												modelId: m.modelId,
												label: m.label,
												isDefault: m.isDefault ? 'on' : 'off',
												caps: [
													...(e.currentTarget.checked
														? [...m.capabilities, cap]
														: m.capabilities.filter((c) => c !== cap))
												]
											})}
									/>
									{cap}
								</label>
							{/each}
						</span>
						<span class="capf">
							<label>
								context
								<input
									type="number"
									min="1000"
									step="1000"
									data-ctx
									value={m.contextWindow ?? ''}
									placeholder="64000"
								/>
							</label>
							{#if m.apiContextWindow}
								<span class="cap-tip" title="provider API 回傳的最大 context（超過会被封頂）">
									≤{m.apiContextWindow.toLocaleString()}
								</span>
							{/if}
							<span class="cap-note"></span>
							<label>
								max-out
								<input
									type="number"
									min="256"
									step="256"
									data-out
									value={m.maxOutputTokens ?? ''}
									placeholder="8192"
								/>
							</label>
							<label>
								effort
								<select
									data-eff
									title="思考強度（deepseek/openai 直接用；anthropic/dashscope 換算 budget）"
								>
									<option value="" selected={m.reasoningEffort == null}>預設</option>
									{#each REASONING_EFFORTS as e (e)}
										<option value={e} selected={m.reasoningEffort === e}>{e}</option>
									{/each}
								</select>
							</label>
							<label
								title="Reasoning budget（token 制 provider 用：anthropic budget_tokens／dashscope thinking_budget；effort 為換算預設）"
							>
								thinking
								<input
									type="number"
									min="0"
									step="512"
									data-rb
									value={m.reasoningBudget ?? ''}
									placeholder="8192"
								/>
							</label>
							<button
								type="button"
								class="chip-btn"
								title="儲存容量（壓縮閾值／輸出／思考預算）"
								onclick={(e) => saveCap(m, e)}>✓ 容量</button
							>
						</span>
					</div>
				{:else}
					<p class="m-empty">尚未有模型 — 按「測試 & 刷新」自 provider 拉取目錄</p>
				{/each}
			</div>
		</article>
	{/each}

	{#if ai.models.length > 0}
		<div class="tasks">
			<h3>任務 → 模型路由</h3>
			<p class="hint">
				未設任務的模型將退回「任一所選 provider 的預設模型」；之後 Content Agent／Workshop
				依此選模型。
			</p>
			{#each TASKS as t (t)}
				<label class="task">
					<span class="task-name">{t}</span>
					<select
						value={taskOf(t)?.id ?? ''}
						onchange={(e) => run('aiTask', { task: t, modelRowId: e.currentTarget.value })}
					>
						<option value="">（退回預設）</option>
						{#each ai.models as m (m.id)}
							<option value={m.id}>{m.providerName} · {m.modelId}</option>
						{/each}
					</select>
					{#if taskOf(t)}
						<span class="chip ok">{taskOf(t)?.capabilities.join(' ')}</span>
					{/if}
				</label>
			{/each}
		</div>
	{/if}

	{#if message}<p class="ai-msg" class:bad={message.startsWith('✗')}>{message}</p>{/if}
</section>

<style>
	.cap-tip {
		font-size: 0.66rem;
		color: var(--color-ink-muted);
		border: 1px dashed var(--color-line);
		border-radius: 0.4rem;
		padding: 0.05rem 0.3rem;
		align-self: center;
	}
	.cap-note {
		font-size: 0.66rem;
		color: var(--color-accent);
		align-self: center;
	}
	.ai {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 2.5rem;
		padding-top: 1.75rem;
		border-top: 1px solid var(--color-line);
	}

	.ai-title {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0;
	}

	.warn {
		margin: 0;
		padding: 0.75rem 1rem;
		border: 1px solid #fbbf24;
		border-radius: 0.625rem;
		background: color-mix(in srgb, #fbbf24 10%, transparent);
		font-size: 0.8125rem;
		color: var(--color-ink);
	}

	.warn code {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.pf {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.875rem;
		padding: 1.125rem;
		background: color-mix(in srgb, var(--color-accent) 4%, transparent);
	}

	.pf-title {
		font-weight: 700;
		font-size: 0.9375rem;
	}

	.pf-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 0.75rem;
	}

	.pf label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.pf input,
	.pf select {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.5rem 0.625rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.875rem;
	}

	.chk {
		flex-direction: row !important;
		align-items: center;
		gap: 0.5rem !important;
	}

	.pf-actions {
		display: flex;
		gap: 0.5rem;
	}

	.add {
		align-self: flex-start;
	}

	.prov {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg-elevated);
		padding: 0.875rem 1rem 1rem;
	}

	.prov[data-enabled='false'] {
		opacity: 0.55;
	}

	.prov-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.prov-name {
		font-weight: 700;
		font-size: 0.9375rem;
	}

	.prov-url {
		margin: 0.375rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		word-break: break-all;
	}

	.grow {
		flex: 1;
	}

	.chip {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 0.375rem;
		padding: 0.125rem 0.375rem;
		color: var(--color-ink-muted);
	}

	.chip.ok {
		border-color: color-mix(in srgb, #34d399 50%, var(--color-line));
		color: #34d399;
	}

	.chip.bad {
		border-color: color-mix(in srgb, #f87171 50%, var(--color-line));
		color: #f87171;
	}

	.chip.star {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.chip.task {
		color: #a78bfa;
		border-color: color-mix(in srgb, #a78bfa 50%, var(--color-line));
	}

	.models {
		margin-top: 0.75rem;
		max-height: 26rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.model {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-size: 0.8125rem;
		border: 1px dashed transparent;
		border-radius: 0.5rem;
		padding: 0.25rem 0.375rem;
	}

	.model.def {
		border-color: color-mix(in srgb, var(--color-accent) 45%, transparent);
		background: color-mix(in srgb, var(--color-accent) 5%, transparent);
	}

	.capf {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.capf label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.62rem;
		color: var(--color-ink-muted);
	}
	.capf input {
		width: 5.2rem;
		font-size: 0.68rem;
		padding: 0.15rem 0.3rem;
	}
	.chip-btn {
		border: 1px solid var(--color-line);
		border-radius: 0.4rem;
		background: var(--color-bg);
		font-size: 0.64rem;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
	}
	.chip-btn:hover {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
	.m-id {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink);
		word-break: break-all;
	}

	.m-empty {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	.caps {
		display: flex;
		gap: 0.375rem;
	}

	.cap {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.6875rem;
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
		cursor: pointer;
	}

	.cap input {
		accent-color: var(--color-accent);
	}

	.mini {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.6875rem;
		border-radius: 0.4375rem;
		padding: 0.1875rem 0.5rem;
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

	.tasks {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		padding: 1rem 1.125rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.tasks h3 {
		margin: 0;
		font-size: 0.9375rem;
	}

	.hint {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.task {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.8125rem;
	}

	.task-name {
		width: 8.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.task select {
		flex: 1;
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		padding: 0.375rem 0.5rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.8125rem;
	}

	.ai-msg {
		margin: 0;
		font-size: 0.8125rem;
		color: #34d399;
	}

	.ai-msg.bad {
		color: #f87171;
	}

	.primary {
		appearance: none;
		border: 1px solid var(--color-accent);
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font: inherit;
		font-size: 0.8125rem;
		padding: 0.4375rem 1rem;
		cursor: pointer;
		font-weight: 600;
	}

	.ghost {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink);
		padding: 0.4375rem 0.875rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.ghost:hover {
		border-color: var(--color-accent);
	}
</style>
