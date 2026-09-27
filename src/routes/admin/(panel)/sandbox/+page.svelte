<script lang="ts">
	/**
	 * /admin/sandbox — Phase 15 Runtime PoC validation page (not on the production render pipeline).
	 * Showcases: controlled loading, cc/1 messaging, theme/article/assets/fetch authorization, default-deny interception, event audit.
	 */
	import { page } from '$app/state';
	import Sandbox, { type SandboxEvent } from '$lib/runtime/Sandbox.svelte';
	import { POC_COMPONENT_HTML } from '$lib/runtime/poc-component';
	import {
		GRANTABLE,
		DENIED,
		type CapabilityContext,
		type PublicArticle
	} from '$lib/runtime/capabilities';
	import type { SearchIndexEntry as SearchIndexItem } from '$lib/plugins/types';

	const THEME_MAP: [string, string][] = [
		['--ink', '--color-ink'],
		['--muted', '--color-ink-muted'],
		['--line', '--color-line'],
		['--bg-elev', '--color-bg-elevated'],
		['--accent', '--color-accent'],
		['--font-body', '--font-body']
	];

	let events = $state<SandboxEvent[]>([]);
	let runKey = $state(0);

	function push(e: SandboxEvent) {
		events = [e, ...events].slice(0, 80);
	}

	const context = $derived<CapabilityContext>({
		articles: ((page.data.searchIndex as SearchIndexItem[] | undefined) ?? []).map(
			(p): PublicArticle => ({ slug: p.slug, title: p.title, summary: p.summary, tags: p.tags })
		),
		theme: readTheme(),
		allowedOrigins: ['https://api.github.com'],
		assetPrefixes: ['/media/', '/covers/']
	});

	function readTheme(): Record<string, string> {
		if (typeof window === 'undefined') return {};
		const css = getComputedStyle(document.documentElement);
		const out: Record<string, string> = {};
		for (const [alias, token] of THEME_MAP) {
			const v = css.getPropertyValue(token).trim();
			if (v) out[alias] = v;
		}
		return out;
	}

	const demoProps = {
		title: 'GitHub Star 元件（不可信 PoC）',
		slug: 'hello-world',
		repo: 'sveltejs/svelte'
	};

	const counts = $derived.by(() => {
		let allow = 0;
		let deny = 0;
		for (const e of events) {
			if (e.verdict === 'allow') allow++;
			else if (e.verdict === 'deny') deny++;
		}
		return { allow, deny };
	});
</script>

<div class="sb-page">
	<header>
		<h1>Component Runtime PoC</h1>
		<p class="sub">
			cc/1 協議 · iframe 不透明 origin · default-deny capabilities · host 端全程審計。
			右側沙箱內是「不可信元件」示範：它只能透過 <code>window.CC</code> 取得核准資源， 越權請求（cookie、非白名單
			origin）会被攔截並顯示在日誌。
		</p>
	</header>

	<div class="cols">
		<section class="stage">
			<div class="stage-head">
				<span>沙箱執行（第 {runKey + 1} 次載入）</span>
				<button type="button" class="rerun" onclick={() => (runKey += 1)}>重跑</button>
			</div>
			{#key runKey}
				<Sandbox html={POC_COMPONENT_HTML} props={demoProps} {context} onEvent={push} />
			{/key}
			<div class="chips">
				<span class="chip ok-g">可申請：{GRANTABLE.join(' / ')}</span>
				<span class="chip no-r">必拒絕：{DENIED.join(' / ')}</span>
			</div>
		</section>

		<section class="audit">
			<div class="audit-head">
				<span>事件審計（{events.length}）</span>
				<span class="tally"
					><b class="ok">{counts.allow}</b> 核准 / <b class="no">{counts.deny}</b> 拒絕</span
				>
			</div>
			<ol>
				{#each events as e, i (events.length - i)}
					<li class={e.verdict === 'allow' ? 'ok' : e.verdict === 'deny' ? 'deny' : ''}>
						<span class="dir"
							>{e.dir === 'in' ? '⬅ 元件→host' : e.dir === 'out' ? '➡ host→元件' : '· sys'}</span
						>
						<code>{e.type}</code>
						{#if e.detail}
							<span class="det">{e.detail}</span>
						{/if}
					</li>
				{:else}
					<li class="empty">等待沙箱訊息…</li>
				{/each}
			</ol>
		</section>
	</div>

	<details class="notes">
		<summary>安全邊界說明（PoC 結論）</summary>
		<ul>
			<li>
				srcdoc + <code>sandbox="allow-scripts"</code>（無 allow-same-origin）：元件讀不到 host
				DOM／cookie／storage。
			</li>
			<li>
				不透明 origin 下 postMessage 只能 <code>'*'</code>；真正的邊界是<strong
					>每次掛載的 channel nonce ＋ cc/1 嚴格驗證 ＋ source 比對</strong
				>，任何不符靜默丟棄。
			</li>
			<li>
				payload 必須 JSON 純資料；能力解析 default-deny，僅回白名單資料（theme 令牌／公開文章／核准
				asset 前綴／核准 origin 的 host 代_fetch）。
			</li>
			<li>
				本頁不接正式渲染：Phase 14.6 官方元件仍走直接掛載；此協議供 Phase 17 Workshop 跑
				AI／第三方元件時複用。
			</li>
		</ul>
	</details>
</div>

<style>
	.sb-page {
		display: grid;
		gap: 1.5rem;
	}

	header h1 {
		margin: 0 0 0.5rem;
		font-size: 1.375rem;
		color: var(--color-ink);
	}

	.sub {
		margin: 0;
		max-width: 68ch;
		font-size: 0.875rem;
		line-height: 1.8;
		color: var(--color-ink-muted);
	}

	.sub code {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.cols {
		display: grid;
		grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
		gap: 1.25rem;
		align-items: start;
	}

	.stage-head,
	.audit-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.625rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.rerun {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.75rem;
		border-radius: 0.4375rem;
		padding: 0.25rem 0.625rem;
		cursor: pointer;
	}

	.rerun:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.chip {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		border-radius: 0.375rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--color-line);
		color: var(--color-ink-muted);
	}

	.chip.ok-g {
		border-color: color-mix(in srgb, #34d399 45%, var(--color-line));
	}

	.chip.no-r {
		border-color: color-mix(in srgb, #f87171 45%, var(--color-line));
	}

	.audit {
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		padding: 0.875rem 1rem 1rem;
		background: var(--color-bg-elevated);
	}

	.tally .ok {
		color: #34d399;
	}
	.tally .no {
		color: #f87171;
	}

	.audit ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		max-height: 30rem;
		overflow-y: auto;
	}

	.audit li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.75rem;
		border-left: 2px solid var(--color-line);
		padding: 0.25rem 0 0.25rem 0.625rem;
		color: var(--color-ink-muted);
	}

	.audit li.ok {
		border-left-color: #34d399;
	}
	.audit li.deny {
		border-left-color: #f87171;
	}

	.audit li code {
		font-family: var(--font-mono);
		color: var(--color-ink);
		font-size: 0.6875rem;
	}

	.audit .dir {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.04em;
	}

	.audit .det {
		flex: 1;
		min-width: 0;
		word-break: break-all;
	}

	.audit li.empty {
		border-left-color: transparent;
	}

	.notes {
		border: 1px dashed var(--color-line);
		border-radius: 0.875rem;
		padding: 0.875rem 1.125rem;
		font-size: 0.8125rem;
		line-height: 1.8;
		color: var(--color-ink-muted);
	}

	.notes summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--color-ink);
	}

	.notes code {
		font-family: var(--font-mono);
	}

	@media (max-width: 1023px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
