<script lang="ts">
	/**
	 * ComponentPicker — the post editor's component inserter (Phase 14.5).
	 * Two steps: ① pick a component → ② form + live preview (mounts the real registry component) + syntax preview → insert.
	 * Form fields are driven by picker/schema.ts definitions; inserting only produces ::: syntax strings — zero pipeline special cases.
	 */
	import { mount, unmount } from 'svelte';
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import { registry } from './registry';
	import MediaPicker from '$lib/components/MediaPicker.svelte';
	import { pickerDefs, type FormValues, type PickerDef, type FieldDef } from './picker/schema';
	import type { SearchIndexEntry as SearchIndexItem } from '$lib/plugins/types';
	import { onMount } from 'svelte';
	import { ensureGsap } from '$lib/animation/core';
	import { prefersReducedMotion } from '$lib/animation/config';
	import { ensureCustomComponent } from '$lib/workshop/custom-registry';

	let {
		oninsert,
		onclose,
		customNames = []
	}: {
		oninsert: (md: string) => void;
		onclose: () => void;
		customNames?: string[];
	} = $props();

	// 43: workshop custom components enter the insert panel — the panel fetches live (new components need no reload)
	let customSel = $state<string | undefined>();
	let customs = $state<string[]>(customNames);
	let custError = $state('');
	onMount(() => {
		void (async () => {
			try {
				const r = await fetch('/api/components/list');
				if (r.ok) {
					const j = (await r.json()) as { names?: string[] };
					if (Array.isArray(j.names)) customs = j.names;
				}
			} catch {
				/* keep the prop snapshot */
			}
		})();
		// panel entrance (C1): backdrop fade-in + card push-up + list stagger
		const gsap = ensureGsap();
		if (prefersReducedMotion()) return;
		gsap.from('.pk-backdrop', { opacity: 0, duration: 0.22, ease: 'power1.out' });
		gsap.from('.pk-card', { y: 18, scale: 0.975, opacity: 0, duration: 0.34, ease: 'power2.out' });
		gsap.from('.pk-item', {
			y: 10,
			opacity: 0,
			duration: 0.3,
			stagger: 0.03,
			delay: 0.1,
			ease: 'power2.out'
		});
	});
	function pickCustom(n: string) {
		def = undefined;
		customSel = n;
		custError = '';
	}

	let def = $state<PickerDef | undefined>();
	let values = $state<FormValues>({});
	let error = $state('');

	/* * preview debounce (typing doesn't rebuild the component per key); JSON.stringify touches every nested property,
	 *  establishing reactive dependencies on deep $state changes (reading the values reference alone wouldn't subscribe to properties) */
	let previewValues = $state<FormValues>({});
	$effect(() => {
		const snap = JSON.stringify(values);
		const t = setTimeout(() => {
			previewValues = JSON.parse(snap) as FormValues;
		}, 150);
		return () => clearTimeout(t);
	});

	const slugs = $derived(
		((page.data.searchIndex as SearchIndexItem[] | undefined) ?? []).map((p) => p.slug)
	);

	function pick(d: PickerDef) {
		customSel = undefined;
		def = d;
		values = JSON.parse(JSON.stringify(d.example)) as FormValues;
		error = '';
	}

	const generated = $derived(
		def ? def.serialize(values) : customSel ? `:::${customSel}\n\n:::` : ''
	);

	/* ---- live preview: mount the real component ---- */
	let host: HTMLElement | undefined = $state();
	let instance: Record<string, unknown> | undefined;
	let custInstance: Record<string, unknown> | undefined;
	let custSeq = 0;
	$effect(() => {
		const n = customSel;
		if (!host || !n) return;
		const seq = ++custSeq;
		void (async () => {
			const c = await ensureCustomComponent(n);
			if (seq !== custSeq || !host) return;
			if (!c) {
				custError = `${n}：編譯失敗或未啟用`;
				return;
			}
			custInstance = mount(c as Component, { target: host, props: { childrenHtml: '' } });
		})();
		return () => {
			custSeq++;
			if (custInstance) {
				unmount(custInstance);
				custInstance = undefined;
			}
		};
	});

	$effect(() => {
		if (!host || !def) return;
		const spec = def.toPreview(previewValues);
		if (instance) {
			unmount(instance);
			instance = undefined;
		}
		// host is a pure mount container (no Svelte children); the DOM is fully owned by mount/unmount
		instance = mount(registry[def.name] as Component, {
			target: host,
			props: { ...spec.props, childrenHtml: spec.childrenHtml ?? '' }
		});
		return () => {
			if (instance) {
				unmount(instance);
				instance = undefined;
			}
		};
	});

	/* ---- images field: list and MediaPicker ---- */
	let mediaTarget = $state<number | null>(null);
	function imageList(f: FieldDef): string[] {
		const arr = (values[f.key] as string[] | undefined) ?? [];
		return arr;
	}
	function setImage(f: FieldDef, i: number, url: string) {
		(values[f.key] as string[])[i] = url;
	}
	function addImage(f: FieldDef) {
		const arr = (values[f.key] as string[] | undefined) ?? [];
		arr.push('');
		values[f.key] = arr;
	}
	function removeImage(f: FieldDef, i: number) {
		(values[f.key] as string[]).splice(i, 1);
	}
	function onMediaPick(result: { url: string }) {
		if (!def || mediaTarget === null) return;
		const f = def.fields.find((x) => x.key === mediaTargetKey);
		if (!f) return;
		const arr = imageList(f);
		if (mediaTarget === -1 || mediaTarget >= arr.length) arr.push(result.url);
		else arr[mediaTarget] = result.url;
		mediaTarget = null;
	}
	let mediaTargetKey = '';
	function openMedia(f: FieldDef, i: number) {
		mediaTargetKey = f.key;
		mediaTarget = i;
	}

	/* ---- keyboard: Esc closes the media library first, then the inserter ---- */
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (mediaTarget !== null) mediaTarget = null;
		else onclose();
	}

	function insert() {
		if (!def && !customSel) return;
		const md = generated;
		if (!md.trim()) return;
		oninsert(md);
	}

	function fieldText(f: FieldDef): string {
		return values[f.key] === undefined || values[f.key] === null ? '' : String(values[f.key]);
	}
	function setFieldText(f: FieldDef, v: string) {
		values[f.key] = v;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="pk-root" role="dialog" aria-modal="true" aria-label="插入元件">
	<div class="pk-backdrop" onclick={onclose}></div>
	<div class="pk-card">
		<header class="pk-head">
			{#if def}
				<button
					type="button"
					class="pk-back"
					onclick={() => {
						def = undefined;
						customSel = undefined;
					}}>←</button
				>
			{/if}
			<h2>
				{def
					? `${def.icon} 插入「${def.label}」`
					: customSel
						? `⌁ 插入自訂元件「${customSel}」`
						: '插入元件'}
			</h2>
			<button type="button" class="pk-close" aria-label="關閉" onclick={onclose}>✕</button>
		</header>

		{#if !def && !customSel}
			<!-- Step 1: official component library + workshop custom section (43) -->
			<div class="pk-scroll">
				<div class="pk-grid pk-nopad">
					{#each pickerDefs as d (d.name)}
						<button type="button" class="pk-item" onclick={() => pick(d)}>
							<span class="pk-icon" aria-hidden="true">{d.icon}</span>
							<span class="pk-name">::{d.name}</span>
							<span class="pk-label">{d.label}</span>
							<span class="pk-desc">{d.description}</span>
						</button>
					{/each}
				</div>
				{#if customs.length > 0}
					<p class="pk-secttl">自訂元件（工坊／AI）</p>
					<div class="pk-grid pk-nopad">
						{#each customs as n (n)}
							<button type="button" class="pk-item" onclick={() => pickCustom(n)}>
								<span class="pk-icon" aria-hidden="true">⌁</span>
								<span class="pk-name">::{n}</span>
								<span class="pk-label">自訂元件</span>
								<span class="pk-desc">點擊插入，預覽即時編譯掛載</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="pk-body">
				<!-- Step 2 left: the form -->
				<div class="pk-form">
					{#if customSel}
						<p class="pk-help">
							自訂元件以 ::: 區塊正文（children）傳內容；插入後直接在正文編輯即可。
						</p>
					{/if}
					{#each def?.fields ?? [] as f (f.key)}
						<label class="pk-field">
							<span class="pk-flabel">{f.label}</span>
							{#if f.kind === 'textarea'}
								<textarea
									rows="6"
									class:mono={f.key === 'items' || f.key === 'source'}
									value={fieldText(f)}
									placeholder={f.placeholder ?? ''}
									oninput={(e) => setFieldText(f, e.currentTarget.value)}></textarea>
							{:else if f.kind === 'select'}
								<select
									value={fieldText(f)}
									onchange={(e) => setFieldText(f, e.currentTarget.value)}
								>
									{#each f.options ?? [] as o (o.value)}
										<option value={o.value}>{o.label}</option>
									{/each}
								</select>
							{:else if f.kind === 'number'}
								<input
									type="number"
									min={f.min}
									max={f.max}
									value={fieldText(f)}
									placeholder={f.placeholder ?? ''}
									oninput={(e) => setFieldText(f, e.currentTarget.value)}
								/>
							{:else if f.kind === 'images'}
								<div class="pk-images">
									{#each imageList(f) as u, i (i)}
										<div class="pk-imgrow">
											<input
												value={u}
												placeholder="/media/… 或 https://…"
												oninput={(e) => setImage(f, i, e.currentTarget.value)}
											/>
											<button type="button" class="pk-mini" onclick={() => openMedia(f, i)}>
												媒體庫
											</button>
											<button
												type="button"
												class="pk-mini danger"
												aria-label="移除"
												onclick={() => removeImage(f, i)}
											>
												✕
											</button>
										</div>
									{/each}
									<div class="pk-imgadd">
										<button type="button" class="pk-mini" onclick={() => addImage(f)}>
											＋ 網址
										</button>
										<button type="button" class="pk-mini" onclick={() => openMedia(f, -1)}>
											＋ 媒體庫
										</button>
									</div>
								</div>
							{:else}
								<input
									value={fieldText(f)}
									placeholder={f.placeholder ?? ''}
									list={f.suggest === 'posts' ? 'pk-slugs' : undefined}
									oninput={(e) => setFieldText(f, e.currentTarget.value)}
								/>
								{#if f.suggest === 'posts'}
									<datalist id="pk-slugs">
										{#each slugs as slug (slug)}
											<option value={slug}></option>
										{/each}
									</datalist>
								{/if}
							{/if}
							{#if f.help}
								<span class="pk-help">{f.help}</span>
							{/if}
						</label>
					{/each}
					{#if error}
						<p class="pk-error">{error}</p>
					{/if}
				</div>

				<!-- Step 2 right: live preview + syntax -->
				<div class="pk-side">
					<p class="pk-flabel">即時預覽（真實元件）</p>
					<div class="pk-preview prose">
						<div class="cc not-prose" bind:this={host}></div>
						{#if customSel && custError}
							<p class="pk-error">{custError}</p>
						{/if}
					</div>
					<p class="pk-flabel">將插入的語法</p>
					<pre class="pk-code">{generated}</pre>
				</div>
			</div>

			<footer class="pk-foot">
				<span class="pk-hint">插入後可在正文直接改語法</span>
				<button
					type="button"
					class="pk-cancel"
					onclick={() => {
						def = undefined;
						customSel = undefined;
					}}>重新選擇</button
				>
				<button type="button" class="pk-insert" onclick={insert}>插入到游標處</button>
			</footer>
		{/if}
	</div>
</div>

<MediaPicker
	open={mediaTarget !== null}
	onClose={() => (mediaTarget = null)}
	onPick={onMediaPick}
/>

<style>
	.pk-root {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.pk-backdrop {
		position: absolute;
		inset: 0;
		background: rgb(8 8 10 / 62%);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.pk-card {
		position: relative;
		width: min(72rem, 100%);
		max-height: min(88vh, 56rem);
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-line);
		border-radius: 1.125rem;
		background: var(--color-bg-elevated);
		box-shadow: 0 32px 80px -24px rgb(0 0 0 / 55%);
		overflow: hidden;
	}

	.pk-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--color-line);
	}

	.pk-head h2 {
		flex: 1;
		margin: 0;
		font-size: 1.0625rem;
		color: var(--color-ink);
	}

	.pk-back,
	.pk-close {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		border-radius: 0.5rem;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
		font-family: inherit;
	}

	.pk-back:hover,
	.pk-close:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}

	/* ---- Step 1 ---- */
	.pk-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1.25rem;
	}

	.pk-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.75rem;
		padding: 1.25rem;
		overflow-y: auto;
	}

	.pk-nopad {
		padding: 0;
		overflow: visible;
	}

	.pk-secttl {
		margin: 1.25rem 0 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		letter-spacing: 0.08em;
		color: var(--color-ink-muted);
	}

	.pk-item {
		display: grid;
		gap: 0.25rem;
		text-align: left;
		padding: 1rem 1.125rem;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg);
		cursor: pointer;
		transition:
			border-color 0.2s ease,
			transform 0.2s ease;
		font-family: inherit;
	}

	.pk-item:hover {
		border-color: var(--color-strong);
		transform: translateY(-2px);
	}

	.pk-icon {
		font-size: 1.375rem;
	}

	.pk-name {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--color-strong);
		letter-spacing: 0.04em;
	}

	.pk-label {
		font-weight: 700;
		color: var(--color-ink);
	}

	.pk-desc {
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}

	/* ---- Step 2 ---- */
	.pk-body {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		gap: 1.25rem;
		padding: 1.25rem;
		overflow-y: auto;
		flex: 1;
	}

	.pk-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0;
	}

	.pk-field {
		display: grid;
		gap: 0.375rem;
		min-width: 0;
	}

	.pk-flabel {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
	}

	.pk-field input,
	.pk-field select,
	.pk-field textarea {
		width: 100%;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-ink);
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.5rem 0.625rem;
	}

	.pk-field textarea {
		resize: vertical;
		line-height: 1.7;
	}

	.pk-field textarea.mono,
	.pk-field input[type='number'] {
		font-family: var(--font-mono);
	}

	.pk-help {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.pk-error {
		margin: 0;
		font-size: 0.8125rem;
		color: #f87171;
	}

	.pk-images {
		display: grid;
		gap: 0.375rem;
	}

	.pk-imgrow {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 0.375rem;
	}

	.pk-mini {
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

	.pk-mini:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}

	.pk-mini.danger:hover {
		color: #f87171;
	}

	.pk-imgadd {
		display: flex;
		gap: 0.375rem;
	}

	.pk-side {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.pk-preview {
		border: 1px dashed var(--color-line);
		border-radius: 0.875rem;
		background: var(--color-bg);
		padding: 1rem 1.25rem;
		min-height: 10rem;
		max-height: 30rem;
		overflow-y: auto;
	}

	.pk-preview :global(.cc) {
		margin: 0;
	}

	.pk-code {
		margin: 0;
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		background: #101014;
		color: #f2f0ea;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.7;
		padding: 0.875rem 1rem;
		max-height: 12rem;
		overflow: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}

	/* ---- footer ---- */
	.pk-foot {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.25rem;
		border-top: 1px solid var(--color-line);
	}

	.pk-hint {
		flex: 1;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.pk-cancel {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.8125rem;
		border-radius: 0.5rem;
		padding: 0.4375rem 0.875rem;
		cursor: pointer;
	}

	.pk-cancel:hover {
		color: var(--color-ink);
	}

	.pk-insert {
		appearance: none;
		border: none;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-family: inherit;
		font-weight: 700;
		font-size: 0.8125rem;
		border-radius: 0.5rem;
		padding: 0.4375rem 1.125rem;
		cursor: pointer;
	}

	.pk-insert:hover {
		filter: brightness(1.08);
	}

	@media (max-width: 1023px) {
		.pk-body {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
