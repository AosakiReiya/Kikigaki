<script lang="ts">
	/**
	 * Sandbox — controlled execution host for untrusted components (Phase 15 PoC).
	 * srcdoc + allow-scripts (no same-origin) → opaque origin;
	 * boundary = channel nonce + strict cc/1 validation + source check + default-deny capabilities.
	 */
	import { onMount } from 'svelte';
	import { BRIDGE_JS } from './bridge-source';
	import { createChannel, parseInbound, type CCEnvelope } from './contract';
	import { resolveCapability, type CapabilityContext } from './capabilities';

	export interface SandboxEvent {
		ts: number;
		dir: 'in' | 'out' | 'sys';
		type: string;
		detail: string;
		verdict?: 'allow' | 'deny';
	}

	let {
		props = {},
		html,
		context,
		onEvent,
		label = 'untrusted component'
	}: {
		props?: Record<string, unknown>;
		html: string;
		context: CapabilityContext;
		onEvent?: (e: SandboxEvent) => void;
		label?: string;
	} = $props();

	let frame: HTMLIFrameElement | undefined = $state();
	let height = $state(80);
	let readyState = $state<'booting' | 'live' | 'closed'>('booting');

	let ch = '';
	let hseq = 0;
	let cleanup: (() => void) | undefined;

	const srcdoc = buildSrcdoc(html);

	function buildSrcdoc(componentHtml: string): string {
		// channel injected at mount; bridge loads before the component script
		//(a literal script closing tag can't appear inside a .svelte script block; avoided via concatenation)
		ch = createChannel();
		const close = '</scr' + 'ipt>';
		return (
			`<!doctype html><html><head><meta charset="utf-8">` +
			`<script>window.__CC_CH__=${JSON.stringify(ch)};${close}` +
			`<script>${BRIDGE_JS}${close}</head><body>${componentHtml}</body></html>`
		);
	}

	function emit(e: Omit<SandboxEvent, 'ts'>) {
		onEvent?.({ ts: Date.now(), ...e });
	}

	function postToFrame(type: string, payload?: unknown, id?: number) {
		frame?.contentWindow?.postMessage({ v: 'cc/1', ch, seq: ++hseq, type, id, payload }, '*');
		emit({ dir: 'out', type, detail: describe(payload) });
	}

	function describe(payload: unknown): string {
		try {
			const s = JSON.stringify(payload);
			return s && s.length > 120 ? s.slice(0, 120) + '…' : (s ?? '');
		} catch {
			return '';
		}
	}

	async function handleInbound(m: CCEnvelope) {
		switch (m.type) {
			case 'ready': {
				readyState = 'live';
				emit({ dir: 'in', type: 'ready', detail: '沙箱啟動，待授 init' });
				postToFrame('init', { name: label, props });
				break;
			}
			case 'capability-request': {
				const p = (m.payload ?? {}) as { capability?: string; params?: unknown };
				const cap = String(p.capability ?? '');
				const result = await resolveCapability(cap, p.params, context);
				emit({
					dir: 'in',
					type: `capability:${cap}`,
					detail: `${describe(p.params)} → ${result.ok ? 'ok' : result.error}`,
					verdict: result.ok ? 'allow' : 'deny'
				});
				postToFrame('capability-result', result, m.id);
				break;
			}
			case 'resize': {
				const h = (m.payload as { height?: number })?.height;
				if (typeof h === 'number' && h > 0) height = Math.min(Math.max(h, 40), 2400);
				break;
			}
			case 'error': {
				emit({
					dir: 'in',
					type: 'error',
					detail: String((m.payload as { message?: string })?.message ?? '')
				});
				break;
			}
			case 'log': {
				emit({
					dir: 'in',
					type: 'log',
					detail: String((m.payload as { message?: string })?.message ?? '')
				});
				break;
			}
		}
	}

	onMount(() => {
		const onMessage = (e: MessageEvent) => {
			// triple validation: source window == this frame, cc/1, channel nonce; any mismatch silently dropped
			if (!frame || e.source !== frame.contentWindow) return;
			const m = parseInbound(e.data, ch);
			if (!m) return;
			void handleInbound(m);
		};
		window.addEventListener('message', onMessage);
		cleanup = () => {
			window.removeEventListener('message', onMessage);
			if (readyState === 'live') postToFrame('dispose');
			readyState = 'closed';
		};
		return cleanup;
	});
</script>

<div class="sandbox" data-state={readyState}>
	<div class="sb-bar">
		<span class="sb-dot" aria-hidden="true"></span>
		iframe · sandbox="allow-scripts" · origin=null · {label}
	</div>
	<iframe bind:this={frame} title={label} {srcdoc} sandbox="allow-scripts" style:height="{height}px"
	></iframe>
</div>

<style>
	.sandbox {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		overflow: hidden;
		background: var(--color-bg);
	}

	.sb-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4375rem 0.75rem;
		border-bottom: 1px solid var(--color-line);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		background: color-mix(in srgb, var(--color-ink) 4%, transparent);
	}

	.sb-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #fbbf24;
	}

	.sandbox[data-state='live'] .sb-dot {
		background: #34d399;
	}

	.sandbox[data-state='closed'] .sb-dot {
		background: var(--color-line);
	}

	iframe {
		display: block;
		width: 100%;
		border: none;
		background: transparent;
	}
</style>
