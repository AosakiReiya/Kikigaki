<script lang="ts">
	/* * Workshop preview pane: compiles and mounts .svelte source live (props controlled by JSON input). */
	import { mount, unmount, flushSync } from 'svelte';
	import type { Component } from 'svelte';
	import { compileComponentSource, injectCss } from '$lib/workshop/compile';

	let { name, code, propsJson }: { name: string; code: string; propsJson: string } = $props();

	let host: HTMLElement | undefined = $state();
	let status = $state<'idle' | 'compiling' | 'ok' | 'error'>('idle');
	let detail = $state('');
	let warnings: string[] = [];
	let instance: Record<string, unknown> | undefined;
	let version = 0;

	$effect(() => {
		const c = code;
		const pj = propsJson;
		const n = name;
		const t = setTimeout(() => void run(n, c, pj), 400);
		return () => clearTimeout(t);
	});

	async function run(n: string, c: string, pj: string) {
		if (!host) return;
		if (!c.trim()) {
			clearInstance();
			status = 'idle';
			detail = '';
			return;
		}
		status = 'compiling';
		let props: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(pj || '{}');
			props =
				parsed && typeof parsed === 'object' && !Array.isArray(parsed)
					? (parsed as Record<string, unknown>)
					: {};
		} catch {
			status = 'error';
			detail = 'Props JSON 無效';
			return;
		}
		const seq = ++version;
		const out = await compileComponentSource(n || 'preview', c);
		if (seq !== version || !host) return; // discard stale results
		if (!out.ok || !out.component) {
			clearInstance();
			status = 'error';
			detail = out.error ?? 'compile_failed';
			return;
		}
		// styles follow the newest version (injectCss overwrites by name)
		if (out.css) injectCss(n || 'preview', out.css);
		clearInstance();
		instance = mount(out.component as Component, { target: host, props });
		warnings = out.warnings ?? [];
		status = 'ok';
		detail = '';
		flushSync();
	}

	function clearInstance() {
		if (instance) {
			unmount(instance);
			instance = undefined;
		}
	}
</script>

<div class="wkv">
	<div class="wkv-bar" data-state={status}>
		{#if status === 'compiling'}⏳ 編譯中…{:else if status === 'error'}✗ {detail}{:else if status === 'ok'}
			✓ 編譯成功{warnings.length ? `（warnings: ${warnings.join(', ')}）` : ''}
		{:else}尚無程式碼{/if}
	</div>
	<div class="wkv-stage" class:invalid={status === 'error'}>
		<div class="prose"><div class="cc not-prose" bind:this={host}></div></div>
	</div>
</div>

<style>
	.wkv {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 0;
	}

	.wkv-bar {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
	}

	.wkv-bar[data-state='ok'] {
		color: #34d399;
	}

	.wkv-bar[data-state='error'] {
		color: #f87171;
	}

	.wkv-stage {
		border: 1px dashed var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg);
		padding: 1rem 1.25rem;
		overflow: auto;
		max-height: 34rem;
	}

	.wkv-stage.invalid {
		border-color: color-mix(in srgb, #f87171 50%, var(--color-line));
	}

	.wkv-stage :global(.cc) {
		margin: 0;
	}
</style>
