<script lang="ts">
	/* * custom Agents management (Phase 32; OpenCode agent settings persisted to DB) */
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	interface AgentItem {
		id: string;
		name: string;
		description: string;
		kind: string;
		baseMode: string;
		persona: string;
		modelRowId: string | null;
		effort: string | null;
		maxSteps: number | null;
		riskCeiling: string;
		color: string | null;
		enabled: boolean;
	}
	interface RuleItem {
		id: string;
		scope: string;
		scopeName: string | null;
		pattern: string;
		action: string;
		createdAt: number;
	}
	interface Data {
		agents: AgentItem[];
		models: { id: string; name: string }[];
		rules: RuleItem[];
	}
	let { data, form }: { data: Data; form?: ActionData } = $props();
	const SCOPE_ZH: Record<string, string> = { global: '全站', agent: 'Agent', session: '對話記憶' };
	const ACTION_ZH: Record<string, string> = { allow: '放行', ask: '必詢', deny: '禁止' };

	const BUILTIN = ['chat', 'plan', 'build', 'explore'];
	const NAME_PATTERN = '[a-z][a-z0-9_-]{1,30}';
	let editing = $state<
		| (Omit<AgentItem, 'maxSteps' | 'modelRowId' | 'effort' | 'color'> & {
				maxSteps: string | number;
				modelRowId: string;
				effort: string;
				color: string;
		  })
		| null
	>(null);

	function startNew(): void {
		editing = {
			id: '',
			name: '',
			description: '',
			kind: 'primary',
			baseMode: 'agent',
			persona: '',
			modelRowId: '',
			effort: '',
			maxSteps: '',
			riskCeiling: 'critical',
			color: '',
			enabled: true
		};
	}
	const EFFORTS = ['', 'off', 'low', 'medium', 'high', 'max'];
</script>

<svelte:head>
	<title>Agents · Kikigaki Admin</title>
</svelte:head>

<h1 class="title">Agents</h1>
<p class="lead">
	OpenCode 的 agent 同構層：每個 agent ＝ persona ＋ 基座風險模式 ＋
	可選模型／思考強度／步數／風險上限。 對話面板的模式段即此清單（內建 chat/plan/build/explore
	不可刪，可停用）。
</p>

{#if form?.message}<p class="msg">{form.message}</p>{/if}

<div class="list">
	{#each data.agents as a (a.id)}
		<div class="row" class:off={!a.enabled}>
			<span class="nm" style={a.color ? `color:${a.color}` : ''}>{a.name}</span>
			<span class="chip">{a.kind}</span>
			<span class="chip">基座 {a.baseMode}</span>
			<span class="chip">≤{a.riskCeiling}</span>
			{#if a.effort}<span class="chip">think:{a.effort}</span>{/if}
			{#if a.maxSteps}<span class="chip">{a.maxSteps} steps</span>{/if}
			{#if !a.enabled}<span class="chip bad">停用</span>{/if}
			<span class="desc">{a.description}</span>
			<span class="grow"></span>
			<button
				type="button"
				class="mini"
				onclick={() =>
					(editing = {
						...a,
						modelRowId: a.modelRowId ?? '',
						effort: a.effort ?? '',
						color: a.color ?? '',
						maxSteps: a.maxSteps == null ? '' : String(a.maxSteps)
					})}>編輯</button
			>
			{#if !BUILTIN.includes(a.name)}
				<form
					method="post"
					action="?/remove"
					use:enhance={() => {
						editing = null;
						return async ({ update }) => await update();
					}}
				>
					<input type="hidden" name="id" value={a.id} />
					<button type="submit" class="mini del">刪除</button>
				</form>
			{/if}
		</div>
	{/each}
</div>

{#if editing}
	<form
		method="post"
		action="?/save"
		class="form"
		use:enhance={() => {
			return async ({ update, formData: fd }) => {
				await update();
				if (!fd.get('id')) editing = null;
			};
		}}
	>
		{#if editing.id}<input type="hidden" name="id" value={editing.id} />{/if}
		<div class="grid">
			<label>
				name
				<input
					name="name"
					pattern={NAME_PATTERN}
					required
					disabled={Boolean(editing.id) && BUILTIN.includes(editing.name)}
					bind:value={editing.name}
					placeholder="my-agent"
				/>
			</label>
			<label>
				類型
				<select name="kind" bind:value={editing.kind}>
					{#each ['primary', 'subagent', 'system'] as k (k)}
						<option>{k}</option>
					{/each}
				</select>
			</label>
			<label>
				基座模式（風險政策）
				<select name="baseMode" bind:value={editing.baseMode}>
					{#each ['chat', 'plan', 'agent'] as k (k)}
						<option value={k}>{k === 'agent' ? 'agent（＝Build 級）' : k}</option>
					{/each}
				</select>
			</label>
			<label>
				風險上限
				<select name="riskCeiling" bind:value={editing.riskCeiling}>
					{#each ['read', 'low', 'medium', 'high', 'critical'] as k (k)}
						<option>{k}</option>
					{/each}
				</select>
			</label>
			<label>
				模型（可選；覆蓋預設路由）
				<select name="modelRowId" bind:value={editing.modelRowId}>
					<option value="">跟隨路由</option>
					{#each data.models as m (m.id)}
						<option value={m.id}>{m.name}</option>
					{/each}
				</select>
			</label>
			<label>
				思考強度
				<select name="effort" bind:value={editing.effort}>
					{#each EFFORTS as e (e)}
						<option value={e}>{e === '' ? '跟隨模型' : e}</option>
					{/each}
				</select>
			</label>
			<label>
				max steps
				<input
					type="number"
					min="1"
					max="100"
					name="maxSteps"
					bind:value={editing.maxSteps}
					placeholder="24"
				/>
			</label>
			<label>
				color
				<input type="text" name="color" bind:value={editing.color} placeholder="#4ade80" />
			</label>
			<label class="wide">
				描述（選擇器 tooltip）
				<input type="text" name="description" maxlength="300" bind:value={editing.description} />
			</label>
			<label class="wide">
				persona（system prompt 人格段；留空＝內建 persona）
				<textarea rows="3" name="persona" maxlength="4000" bind:value={editing.persona}></textarea>
			</label>
		</div>
		<div class="bar">
			<label class="chk">
				<input type="checkbox" name="enabled" checked={editing.enabled} />
				啟用
			</label>
			<span class="grow"></span>
			<button type="button" class="mini" onclick={() => (editing = null)}>取消</button>
			<button type="submit" class="mini primary">{editing.id ? '儲存' : '建立'}</button>
		</div>
	</form>
{:else}
	<button type="button" class="mini add" onclick={startNew}>＋ 新增 Agent</button>
{/if}

<h2 class="sub-title">權限規則（Phase 33）</h2>
<p class="lead">
	覆寫工具預設的审批行為。<b>作用層級由內而外：Session（對話記憶）&gt; Agent（指定助手）&gt; 全站</b
	>；同一工具命中多條時，層級小的優先、同層越下面越新越優先。工具名支援
	<code>*</code> 萬用字元。
</p>

<div class="list">
	{#each data.rules as r (r.id)}
		<div class="row">
			<span class="chip">{SCOPE_ZH[r.scope] ?? r.scope}</span>
			{#if r.scope === 'agent' && r.scopeName}<span class="nm">僅 {r.scopeName}</span>{/if}
			<code>{r.pattern}</code>
			<span class="chip act-{r.action}">{ACTION_ZH[r.action] ?? r.action}</span>
			<span class="grow"></span>
			{#if r.scope === 'session'}
				<form
					method="post"
					action="?/ruleClearSession"
					use:enhance={() =>
						async ({ update }) =>
							await update()}
				>
					<input type="hidden" name="scopeName" value={r.scopeName ?? ''} />
					<button type="submit" class="mini" title="清除整個 session 的記憶">清 session</button>
				</form>
			{/if}
			<form
				method="post"
				action="?/ruleRemove"
				use:enhance={() =>
					async ({ update }) =>
						await update()}
			>
				<input type="hidden" name="id" value={r.id} />
				<button type="submit" class="mini del">×</button>
			</form>
		</div>
	{:else}
		<p class="lead">尚無規則 — 全部走風險分級預設。</p>
	{/each}
</div>

<form method="post" action="?/ruleAdd" class="form" use:enhance>
	<div class="grid">
		<label>
			套用到
			<select name="target">
				<option value="global">全站（所有 Agent）</option>
				{#each data.agents as a (a.name)}
					<option value={a.name}>僅「{a.name}」（{a.description || a.baseMode}）</option>
				{/each}
			</select>
		</label>
		<label>
			工具
			<input
				type="text"
				name="pattern"
				required
				placeholder="工具名，或 * 萬用字元（publish_post、mmcp_*）"
			/>
		</label>
		<label>
			行為
			<select name="action">
				<option value="allow">自動放行（跳過審批）</option>
				<option value="ask">一律先詢問</option>
				<option value="deny">禁止（隱藏該工具）</option>
			</select>
		</label>
	</div>
	<div class="bar">
		<span class="grow"></span>
		<button type="submit" class="mini primary">＋ 加規則</button>
	</div>
</form>

<style>
	.sub-title {
		font-size: 1.15rem;
		margin: 1.6rem 0 0.2rem;
	}
	code {
		padding: 0.05rem 0.35rem;
		border-radius: 0.35rem;
		background: color-mix(in srgb, var(--color-ink) 7%, transparent);
		font-size: 0.75rem;
	}
	.title {
		font-size: 1.6rem;
		margin: 0 0 0.2rem;
	}
	.lead {
		font-size: 0.82rem;
		color: var(--color-ink-muted);
		line-height: 1.7;
		margin: 0 0 0.9rem;
	}
	.msg {
		font-size: 0.8rem;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--color-line);
		border-radius: 0.6rem;
		font-size: 0.8rem;
		flex-wrap: wrap;
	}
	.row.off {
		opacity: 0.55;
	}
	.nm {
		font-weight: 700;
	}
	.chip {
		font-size: 0.64rem;
		border: 1px solid var(--color-line);
		border-radius: 0.4rem;
		padding: 0.03rem 0.32rem;
		color: var(--color-ink-muted);
	}
	.chip.bad {
		border-color: color-mix(in srgb, #e5484d 50%, transparent);
		color: #b91c1c;
	}
	.desc {
		color: var(--color-ink-muted);
		font-size: 0.72rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.grow {
		flex: 1;
	}
	.mini {
		border: 1px solid var(--color-line);
		background: none;
		color: inherit;
		border-radius: 0.45rem;
		padding: 0.2rem 0.55rem;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.mini:hover {
		border-color: var(--color-accent);
	}
	.del {
		border-color: color-mix(in srgb, #e5484d 45%, transparent);
	}
	.primary {
		border-color: var(--color-accent);
		background: var(--color-accent);
		color: var(--color-accent-ink, #fff);
		font-weight: 600;
	}
	.form {
		border: 1px dashed var(--color-line);
		border-radius: 0.7rem;
		padding: 0.8rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.55rem 0.9rem;
		font-size: 0.78rem;
	}
	.grid label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.grid input,
	.grid select,
	.grid textarea {
		font: inherit;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.chk {
		display: flex;
		gap: 0.3rem;
		align-items: center;
		font-size: 0.78rem;
	}
</style>
