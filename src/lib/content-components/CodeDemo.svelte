<script lang="ts">
	/**
	 * :::code — runnable code demos (multi-file tabs + execution output).
	 * Data sources:
	 *   1. JSON body { "filename": "source", ... } (lang= / title= modifiers)
	 *   2. fallback: when the surrounding markdown code fence is already the body, use code= directly
	 * Note: "run" executes author-written code via new Function (content is admin-writable only — author-level trust).
	 */
	let {
		data,
		lang = 'ts',
		title = '',
		code = ''
	}: {
		data?: unknown;
		lang?: string;
		title?: string;
		code?: string;
	} = $props();

	const files = $derived.by(() => {
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			return Object.entries(data as Record<string, unknown>)
				.filter(([, src]) => typeof src === 'string')
				.map(([name, src]) => ({ name, source: src as string }));
		}
		if (code) return [{ name: String(title || 'demo'), source: String(code) }];
		return [];
	});

	let active = $state(0);
	let output = $state<string[] | null>(null);

	const current = $derived(files[Math.min(active, Math.max(files.length - 1, 0))]);

	async function copy() {
		if (!current) return;
		try {
			await navigator.clipboard.writeText(current.source);
			output = ['已複製到剪貼簿'];
		} catch {
			output = ['複製失敗（瀏覽器不允許）'];
		}
	}

	function run() {
		if (!current) return;
		const lines: string[] = [];
		const capture = (...args: unknown[]) => lines.push(args.map((a) => stringify(a)).join(' '));
		const fn = new Function('console', codeStrip(current.source));
		try {
			fn({ log: capture, error: capture, warn: capture, info: capture });
			output = lines.length ? lines : ['（無輸出）'];
		} catch (e) {
			output = [...lines, `✗ ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`];
		}
	}

	function stringify(v: unknown): string {
		if (typeof v === 'string') return v;
		try {
			return JSON.stringify(v) ?? String(v);
		} catch {
			return String(v);
		}
	}

	/* * before running, only import lines are stripped (mark TS with comments; runnable JS recommended for execution code) */
	function codeStrip(source: string): string {
		return source.replace(/^\s*import\s.+$/gm, '');
	}
</script>

{#if files.length > 0}
	<div class="codeblock">
		<div class="cb-head">
			{#if title}
				<span class="cb-title">{String(title)}</span>
			{/if}
			{#if files.length > 1}
				<div class="cb-tabs" role="tablist">
					{#each files as file, i (i)}
						<button
							type="button"
							role="tab"
							class="cb-tab"
							class:active={i === active}
							aria-selected={i === active}
							onclick={() => {
								active = i;
								output = null;
							}}
						>
							{file.name}
						</button>
					{/each}
				</div>
			{:else}
				<span class="cb-file">{current?.name}</span>
			{/if}
			<span class="cb-spacer"></span>
			<button type="button" class="cb-btn" onclick={copy}>複製</button>
			{#if String(lang) !== 'text'}
				<button type="button" class="cb-btn run" onclick={run}>執行</button>
			{/if}
		</div>
		<pre class="cb-pre"><code>{current?.source}</code></pre>
		{#if output !== null}
			<div class="cb-out" aria-live="polite">
				<span class="cb-out-label">輸出（console 已捕捉）</span>
				{#each output as line, i (i)}
					<pre>{line}</pre>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<p class="cb-error">code：缺少示範碼（JSON 內文 {'{"file.ts": "..."}'} 或 code=）</p>
{/if}

<style>
	.codeblock {
		margin: 2rem 0;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		overflow: hidden;
		background: #101014;
	}

	.cb-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--color-line);
		background: color-mix(in srgb, var(--color-ink) 5%, #101014);
	}

	.cb-title,
	.cb-file {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.cb-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.cb-tab {
		appearance: none;
		border: none;
		background: none;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.cb-tab.active {
		color: var(--color-strong);
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	}

	.cb-spacer {
		flex: 1;
	}

	.cb-btn {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		padding: 0.25rem 0.625rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.cb-btn:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}

	.cb-btn.run:hover {
		color: var(--color-strong);
		border-color: var(--color-strong);
	}

	.cb-pre {
		margin: 0;
		padding: 1.25rem 1.5rem;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		line-height: 1.75;
		color: #f2f0ea;
		background: transparent;
		border: none;
		border-radius: 0;
	}

	.cb-out {
		border-top: 1px dashed var(--color-line);
		padding: 0.875rem 1.5rem 1.125rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: #f2f0ea;
		max-height: 18rem;
		overflow-y: auto;
	}

	.cb-out-label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-strong);
	}

	.cb-out pre {
		margin: 0.25rem 0;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.cb-error {
		margin: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}
</style>
