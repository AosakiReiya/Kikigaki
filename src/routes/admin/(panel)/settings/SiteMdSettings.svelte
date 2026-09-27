<script lang="ts">
	/**
	 * SITE.md instruction layer (Phase 28) — injected at the top of the Agent's system prompt every conversation.
	 * Stored in site_settings key-value (zero migration); 4000-char cap; empty = not injected.
	 */
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';

	let { value }: { value: string } = $props();

	let draft = $state(value);
	let lastExternal = $state(value);
	$effect(() => {
		if (value !== lastExternal) {
			lastExternal = value;
			draft = value;
		}
	});
	let busy = $state(false);
	let msg = $state('');

	const dirty = $derived(draft.trim() !== value.trim());

	async function save(): Promise<void> {
		busy = true;
		msg = '';
		const fd = new FormData();
		fd.set('instructions', draft);
		try {
			const res = await fetch('/admin/settings?/siteMd', { method: 'POST', body: fd });
			const out = deserialize(await res.text()) as {
				type?: string;
				data?: { message?: string };
			};
			msg = out?.data?.message ?? `HTTP ${res.status}`;
			if (out?.type === 'success') void invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<section class="card">
	<h2>Agent 指令（SITE.md）</h2>
	<p class="sub">
		OpenCode 的 <code>AGENTS.md</code> 同構層：站長永久指令，注入每次 Agent 對話的 system prompt 頂段（壓縮後仍重注、不會丟失）。留空＝不注入。
	</p>
	<textarea
		class="instr"
		rows="6"
		maxlength="4000"
		bind:value={draft}
		placeholder="例：翻譯時語氣輕快；新元件一律附 prefers-reduced-motion 支援；標籤譯名保留原 slug…"
	></textarea>
	<div class="row">
		<span class="count">{draft.length} / 4000</span>
		<span class="grow"></span>
		{#if msg}<span class="m">{msg}</span>{/if}
		<button type="button" class="primary" disabled={busy || !dirty} onclick={save}>
			{busy ? '儲存中…' : '儲存指令'}
		</button>
	</div>
</section>

<style>
	.card {
		margin-top: 1.5rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid var(--color-line);
		border-radius: 0.9rem;
		background: var(--color-bg-elevated, transparent);
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
	.instr {
		width: 100%;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8rem;
		line-height: 1.6;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--color-line);
		border-radius: 0.55rem;
		background: var(--color-bg);
		color: inherit;
		resize: vertical;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.count {
		font-size: 0.7rem;
		color: var(--color-ink-muted);
	}
	.grow {
		flex: 1;
	}
	.m {
		font-size: 0.76rem;
	}
	.primary {
		border: 1px solid var(--color-accent);
		border-radius: 0.55rem;
		background: var(--color-accent);
		color: var(--color-accent-ink, #fff);
		font-size: 0.8rem;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
	}
	.primary:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
