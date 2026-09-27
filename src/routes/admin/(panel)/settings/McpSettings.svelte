<script lang="ts">
	/**
	 * MCP servers management (Phase 30) — remote only (Streamable HTTP).
	 * Save → automatically tries a catalog refresh; the "test" button reconnects and updates the tool cache.
	 */
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';

	interface ServerRow {
		id: string;
		name: string;
		label: string;
		url: string;
		enabled: boolean;
		timeoutMs: number;
		risk: string;
		instructions: string;
		status: string;
		statusNote: string;
		hasHeaders: boolean;
		toolCount: number;
	}
	let { mcp }: { mcp: { secretSet: boolean; servers: ServerRow[] } } = $props();

	let editId = $state<string | null>(null);
	let busy = $state('');
	let msg = $state('');
	let expanded = $state<string | null>(null);

	let fName = $state('');
	let fLabel = $state('');
	let fUrl = $state('');
	let fRisk = $state('high');
	let fTimeout = $state(30000);
	let fHeaders = $state('');
	let fInstr = $state('');
	let fEnabled = $state(true);

	const dirty = $derived(fName.trim() === '' || fUrl.trim() === '');

	function startNew(): void {
		editId = 'new';
		fName = '';
		fLabel = '';
		fUrl = '';
		fRisk = 'high';
		fTimeout = 30000;
		fHeaders = '';
		fInstr = '';
		fEnabled = true;
	}
	function startEdit(s: ServerRow): void {
		editId = s.id;
		fName = s.name;
		fLabel = s.label;
		fUrl = s.url;
		fRisk = s.risk;
		fTimeout = s.timeoutMs;
		fHeaders = '';
		fInstr = s.instructions;
		fEnabled = s.enabled;
	}

	async function run(
		action: string,
		fields: Record<string, string | boolean | number>
	): Promise<void> {
		busy = action + (fields.id ?? '');
		msg = '';
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
		try {
			const res = await fetch(`/admin/settings?/${action}`, { method: 'POST', body: fd });
			const out = deserialize(await res.text()) as {
				type?: string;
				data?: { message?: string };
			};
			msg = out?.data?.message ?? `HTTP ${res.status}`;
			if (out?.type === 'success') void invalidateAll();
		} finally {
			busy = '';
		}
	}
</script>

<section class="card">
	<h2>MCP Servers（remote）</h2>
	<p class="sub">
		Connect to external tools via the
		<a href="https://modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">MCP</a>
		protocol (Streamable HTTP; stdio-type servers are not supported due to the Pages platform limitations).
		Discovered tools are incorporated into the Agent's toolset following each server's risk level and
		go through the approval mechanism.
	</p>
	{#if !mcp.secretSet}
		<p class="warn-note">
			⚠ AI_SECRET is not set — the token in headers cannot be encrypted, and connections cannot be
			tested.
		</p>
	{/if}

	<div class="list">
		{#each mcp.servers as s (s.id)}
			<div class="row">
				<span class="dot" data-st={s.status} title="{s.status} {s.statusNote}"></span>
				<button class="nm" onclick={() => (expanded = expanded === s.id ? null : s.id)}>
					<strong>{s.name}</strong>
					<span class="u">{s.url}</span>
				</button>
				<span class="chip">{s.risk}</span>
				<span class="chip">{s.toolCount} tools</span>
				{#if !s.enabled}<span class="chip off">disabled</span>{/if}
				<span class="grow"></span>
				<button
					type="button"
					class="mini"
					disabled={busy === 'mcpTest' + s.id}
					onclick={() => void run('mcpTest', { id: s.id })}>測</button
				>
				<button
					type="button"
					class="mini"
					onclick={() =>
						void run('mcpSave', {
							id: s.id,
							name: s.name,
							label: s.label,
							url: s.url,
							risk: s.risk,
							timeoutMs: s.timeoutMs,
							instructions: s.instructions,
							enabled: s.enabled ? 'off' : 'on'
						})}>{s.enabled ? '停用' : '啟用'}</button
				>
				<button type="button" class="mini" onclick={() => startEdit(s)}>編輯</button>
				<button
					type="button"
					class="mini del"
					onclick={() => {
						if (confirm(`Remove MCP server「${s.name}」?`)) void run('mcpDelete', { id: s.id });
					}}>×</button
				>
			</div>
			{#if expanded === s.id}
				<div class="detail">
					{#if s.instructions}<pre class="ins">{s.instructions}</pre>{/if}
					{#if s.statusNote}<p class="note">status: {s.status} — {s.statusNote}</p>{/if}
					<p class="note">
						Tool directory cache is updated via "測／save／refresh"; tools appear in the Agent's
						tool list as <code>{s.name}_&lt;tool&gt;</code> (viewable in the expanded tool card).
					</p>
				</div>
			{/if}
		{:else}
			<p class="note">No MCP servers configured yet.</p>
		{/each}
	</div>

	{#if editId}
		<div class="form">
			<div class="grid">
				<label>
					name
					<input type="text" bind:value={fName} placeholder="weather（a-z0-9_-，工具前綴）" />
				</label>
				<label>
					顯示名
					<input type="text" bind:value={fLabel} placeholder="選填" />
				</label>
				<label class="wide">
					URL（Streamable HTTP endpoint）
					<input type="text" bind:value={fUrl} placeholder="https://example.com/mcp" />
				</label>
				<label>
					風險
					<select bind:value={fRisk}>
						{#each ['read', 'low', 'medium', 'high', 'critical'] as r (r)}
							<option value={r}>{r}</option>
						{/each}
					</select>
				</label>
				<label>
					timeout (ms)
					<input type="number" min="3000" max="120000" step="1000" bind:value={fTimeout} />
				</label>
				<label class="wide">
					headers（JSON，加密儲存；例
					<code>JSON 格式：key 為 header 名，value 為 token</code>）
					<textarea
						rows="2"
						bind:value={fHeaders}
						placeholder="&#123;&quot;Authorization&quot;: &quot;Bearer …&quot;&#125;"></textarea>
				</label>
				<label class="wide">
					instructions（注入 system prompt 的 server 使用說明）
					<textarea rows="2" bind:value={fInstr} placeholder="例：query 參數需為完整句子…"
					></textarea>
				</label>
			</div>
			<div class="bar">
				{#if msg}<span class="m">{msg}</span>{/if}
				<span class="grow"></span>
				<button type="button" class="mini" onclick={() => (editId = null)}>取消</button>
				<button
					type="button"
					class="mini primary"
					disabled={busy !== '' || dirty}
					onclick={() =>
						void run('mcpSave', {
							...(editId && editId !== 'new' ? { id: editId } : {}),
							name: fName,
							label: fLabel,
							url: fUrl,
							risk: fRisk,
							timeoutMs: fTimeout,
							instructions: fInstr,
							headers: fHeaders,
							enabled: fEnabled ? 'on' : 'off'
						})}>{busy === 'mcpSave' ? '儲存中…' : '儲存並連線'}</button
				>
			</div>
		</div>
	{:else}
		<button type="button" class="mini add" onclick={startNew}>＋ 新增 MCP Server</button>
	{/if}
</section>

<style>
	.card {
		margin-top: 1.5rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.sub {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
	}
	.warn-note {
		font-size: 0.76rem;
		color: #b45309;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.4rem;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		flex-wrap: wrap;
	}
	.row:hover {
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}
	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--color-line);
		flex: none;
	}
	.dot[data-st='connected'] {
		background: #16a34a;
	}
	.dot[data-st='failed'] {
		background: #e5484d;
	}
	.nm {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		padding: 0;
		min-width: 0;
	}
	.u {
		font-size: 0.68rem;
		color: var(--color-ink-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 260px;
		white-space: nowrap;
	}
	.chip {
		font-size: 0.64rem;
		border: 1px solid var(--color-line);
		border-radius: 0.4rem;
		padding: 0.03rem 0.32rem;
		color: var(--color-ink-muted);
	}
	.chip.off {
		border-color: color-mix(in srgb, #e5484d 50%, transparent);
		color: #b91c1c;
	}
	.grow {
		flex: 1;
	}
	.mini {
		border: 1px solid var(--color-line);
		background: none;
		color: inherit;
		border-radius: 0.42rem;
		padding: 0.16rem 0.5rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.mini:hover {
		border-color: var(--color-accent);
	}
	.mini:disabled {
		opacity: 0.5;
		cursor: default;
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
	.detail {
		padding: 0 0.6rem 0.4rem;
		font-size: 0.72rem;
		color: var(--color-ink-muted);
	}
	.ins {
		background: color-mix(in srgb, var(--color-ink) 5%, transparent);
		border-radius: 0.45rem;
		padding: 0.4rem 0.55rem;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		font-family: inherit;
	}
	.note {
		margin: 0.15rem 0;
	}
	.form {
		border: 1px dashed var(--color-line);
		border-radius: 0.65rem;
		padding: 0.7rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem 0.8rem;
		font-size: 0.76rem;
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
		padding: 0.32rem 0.45rem;
		border: 1px solid var(--color-line);
		border-radius: 0.45rem;
		background: var(--color-bg);
		color: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.m {
		font-size: 0.74rem;
	}
</style>
