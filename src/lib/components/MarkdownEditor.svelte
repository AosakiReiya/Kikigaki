<script lang="ts">
	import { Carta, MarkdownEditor } from 'carta-md';
	import { attachment } from '@cartamd/plugin-attachment';
	import sanitizeHtml from 'sanitize-html';
	import { renderMarkdown } from '$lib/markdown';
	import { hydrateComponents } from '$lib/content/hydrate';
	import ComponentPicker from '$lib/content-components/ComponentPicker.svelte';
	import MediaPicker from '$lib/components/MediaPicker.svelte';
	import 'carta-md/default.css';
	import '@cartamd/plugin-attachment/default.css';

	export type ViewMode = 'edit' | 'split' | 'preview';

	let {
		value,
		onChange,
		customNames
	}: {
		value?: string;
		onChange?: (md: string) => void;
		/* * Workshop custom component names (same ::: recognition as formal rendering) */
		customNames?: string[];
	} = $props();

	let current = $state(value ?? '');

	const VIEW_MODE_KEY = 'kikigaki-editor-view';

	function loadViewMode(): ViewMode {
		try {
			const stored = localStorage.getItem(VIEW_MODE_KEY);
			if (stored === 'edit' || stored === 'split' || stored === 'preview') return stored;
		} catch {
			/* ignore */
		}
		return 'split';
	}

	let viewMode = $state<ViewMode>(loadViewMode());

	$effect(() => {
		try {
			localStorage.setItem(VIEW_MODE_KEY, viewMode);
		} catch {
			/* ignore */
		}
	});

	/* * preview (same render pipeline as front-end posts, updated after debounce) */
	const nameSet = $derived(customNames?.length ? new Set(customNames) : undefined);
	let previewHtml = $state(renderMarkdown(current, nameSet).html);
	let previewTimeout: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const md = current;
		const names = nameSet;
		clearTimeout(previewTimeout);
		previewTimeout = setTimeout(() => {
			previewHtml = renderMarkdown(md, names).html;
		}, 250);
		return () => clearTimeout(previewTimeout);
	});

	let editorPane = $state<HTMLElement | undefined>();
	let previewPane = $state<HTMLElement | undefined>();

	let syncRaf = 0;

	/* * in split mode: editor scroll → preview pane one-way proportional sync (rAF throttled, anti-jitter) */
	$effect(() => {
		if (viewMode !== 'split') return;
		const editor = editorPane?.querySelector<HTMLElement>('.carta-input') ?? null;
		const preview = previewPane;
		if (!editor || !preview) return;

		const sync = () => {
			syncRaf = 0;
			const max = editor.scrollHeight - editor.clientHeight;
			if (max > 0) {
				preview.scrollTop =
					(editor.scrollTop / max) * (preview.scrollHeight - preview.clientHeight);
			}
		};

		const onEditor = () => {
			if (syncRaf) cancelAnimationFrame(syncRaf);
			syncRaf = requestAnimationFrame(sync);
		};

		editor.addEventListener('scroll', onEditor, { passive: true });
		return () => {
			editor.removeEventListener('scroll', onEditor);
			if (syncRaf) cancelAnimationFrame(syncRaf);
		};
	});

	/* * upload to R2 (via /api/media); returns the public URL on success */
	async function uploadToMedia(file: File): Promise<string | null> {
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch('/api/media', { method: 'POST', body: fd });
		if (!res.ok) return null;
		const { url } = (await res.json()) as { url: string };
		return url;
	}

	const carta = new Carta({
		extensions: [
			attachment({
				upload: uploadToMedia,
				// anything but images is refused (the blog doesn't need attachments for now)
				supportedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
			})
		],
		sanitizer: (html) => sanitizeHtml(html)
	});

	/* * insert an image at the current cursor position */
	function insertImageAtCursor(url: string, alt: string) {
		const input = carta.input;
		if (!input) return;
		const pos = input.textarea.selectionStart ?? input.textarea.value.length;
		const md = `![${alt}](${url})`;
		input.insertAt(pos, md);
		input.textarea.setSelectionRange(pos + md.length, pos + md.length);
		input.update();
		// Carta programmatic inserts don't dispatch native input events → bind:value desyncs → saves would write back old values (fixed in Phase 44)
		input.textarea.dispatchEvent(new Event('input', { bubbles: true }));
		input.textarea.focus();
	}

	/* * component inserter and media library selection */
	let pickerOpen = $state(false);
	let mediaOpen = $state(false);

	/* * insert a ::: block at the cursor (auto-pads blank lines into a standalone block) */
	function insertSnippetAtCursor(md: string) {
		const input = carta.input;
		if (!input) return;
		const ta = input.textarea;
		const pos = ta.selectionStart ?? ta.value.length;
		const before = ta.value.slice(0, pos);
		const sep =
			before === '' || /\n\s*$/.test(before) ? (/\n\s*\n\s*$/.test(before) ? '' : '\n') : '\n\n';
		const snippet = `${sep}${md}\n\n`;
		input.insertAt(pos, snippet);
		ta.setSelectionRange(pos + snippet.length, pos + snippet.length);
		input.update();
		// same as above: no events = blind to dirty/form state (root cause of saves missing after custom-component inserts)
		ta.dispatchEvent(new Event('input', { bubbles: true }));
		ta.focus();
		pickerOpen = false;
	}

	$effect(() => {
		onChange?.(current);
	});
</script>

<div class="md-workbench">
	<div class="md-viewbar">
		<div class="md-switch" role="group" aria-label="檢視模式">
			<button class:active={viewMode === 'edit'} type="button" onclick={() => (viewMode = 'edit')}>
				編輯
			</button>
			<button
				class:active={viewMode === 'split'}
				type="button"
				onclick={() => (viewMode = 'split')}
			>
				分割
			</button>
			<button
				class:active={viewMode === 'preview'}
				type="button"
				onclick={() => (viewMode = 'preview')}
			>
				預覽
			</button>
		</div>
		<div class="vb-actions">
			<button type="button" class="vb-btn" onclick={() => (mediaOpen = true)}>🖼 圖片</button>
			<button type="button" class="vb-btn accent" onclick={() => (pickerOpen = true)}
				>＋ 元件</button
			>
		</div>
	</div>

	<div
		class="md-panes"
		class:edit-only={viewMode === 'edit'}
		class:split={viewMode === 'split'}
		class:preview-only={viewMode === 'preview'}
	>
		<div class="md-editor-pane" bind:this={editorPane}>
			<MarkdownEditor bind:value={current} {carta} mode="split" placeholder="開始寫作…" />
		</div>
		<div class="md-preview-pane" bind:this={previewPane}>
			<!-- same renderMarkdown + .prose styles as front-end posts -->
			<div class="prose" aria-label="文章預覽" use:hydrateComponents={{ src: previewHtml }}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- produced by controlled markdown-it (html:false already blocks raw HTML); same pipeline as the front end -->
				{@html previewHtml}
			</div>
		</div>
	</div>
</div>

{#if pickerOpen}
	<ComponentPicker
		{customNames}
		oninsert={insertSnippetAtCursor}
		onclose={() => (pickerOpen = false)}
	/>
{/if}

<MediaPicker
	open={mediaOpen}
	onClose={() => (mediaOpen = false)}
	onPick={({ url }) => {
		insertImageAtCursor(url, url.split('/').pop() ?? '');
		mediaOpen = false;
	}}
/>

<style>
	.md-workbench {
		border-radius: 0.875rem;
		overflow: hidden;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
	}

	.md-viewbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.625rem;
		border-bottom: 1px solid var(--color-line);
		background: var(--color-bg);
	}

	.md-switch {
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.1875rem;
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
	}

	.md-switch button {
		appearance: none;
		background: none;
		border: none;
		font-family: inherit;
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		padding: 0.25rem 0.75rem;
		border-radius: 0.4375rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}

	.md-switch button:hover {
		color: var(--color-ink);
	}

	.md-switch button.active {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
		color: var(--color-ink);
	}
	.vb-actions {
		display: flex;
		gap: 0.375rem;
	}

	.vb-btn {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		border-radius: 0.625rem;
		padding: 0.3125rem 0.875rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.vb-btn:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-muted);
	}

	.vb-btn.accent {
		border: 1px solid var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
		color: var(--color-ink);
	}

	.vb-btn.accent:hover {
		background: color-mix(in srgb, var(--color-accent) 22%, transparent);
		border-color: var(--color-accent);
	}

	.md-panes {
		display: flex;
		height: clamp(26rem, 62vh, 40rem);
	}

	.md-editor-pane {
		flex: 1 1 100%;
		min-width: 0;
		height: 100%;
	}

	.md-panes.split .md-editor-pane {
		flex: 1 1 50%;
		border-right: 1px solid var(--color-line);
	}

	.md-preview-pane {
		flex: 1 1 50%;
		min-width: 0;
		height: 100%;
		overflow-y: auto;
		padding: 2rem 1.25rem 3rem;
		background: var(--color-bg);
		display: none;
	}

	.md-panes.split .md-preview-pane,
	.md-panes.preview-only .md-preview-pane {
		display: block;
	}

	.md-panes.edit-only .md-preview-pane {
		display: none;
	}

	.md-panes.preview-only .md-editor-pane {
		display: none;
	}

	.md-panes.preview-only .md-preview-pane {
		flex: 1 1 100%;
	}

	.md-preview-pane :global(.prose) {
		max-width: 65ch;
		margin: 0 auto;
	}

	/* map Carta theme variables onto the site design system (light/dark both follow data-theme) */
	.md-editor-pane :global(.carta-theme__default) {
		--border-color: var(--color-line);
		--hover-color: color-mix(in srgb, var(--color-ink) 6%, transparent);
		--focus-outline: var(--color-accent);
		--caret-color: var(--color-ink);
		--text-color: var(--color-ink);
		--selection-color: color-mix(in srgb, var(--color-accent) 22%, transparent);

		/* dark variables (Carta declares both by default — never fall back to hardcoded colors in any context) */
		--border-color-dark: var(--color-line);
		--hover-color-dark: color-mix(in srgb, var(--color-ink) 8%, transparent);
		--focus-outline-dark: var(--color-accent);
		--caret-color-dark: var(--color-ink);
		--text-color-dark: var(--color-ink);
	}

	.md-editor-pane :global(.carta-editor) {
		border-radius: 0.875rem;
		height: 100%;
	}

	.md-editor-pane :global(.carta-wrapper) {
		flex: 1;
		overflow: hidden;
	}

	.md-editor-pane :global(.carta-container),
	.md-editor-pane :global(.carta-container > *) {
		height: 100%;
	}

	.md-editor-pane :global(.carta-container.mode-split > *) {
		width: 100%;
	}

	/* Carta's built-in preview isn't needed (we use our own preview panel).
	   Carta injects inline display:unset into the renderer in split mode;
	   it must be overridden with !important or the editor column gets squeezed to half width. */
	.md-editor-pane :global(.carta-renderer) {
		display: none !important;
	}

	.md-editor-pane :global(.mode-split.carta-container::after) {
		content: none;
	}

	.md-editor-pane :global(.carta-toolbar) {
		background: var(--color-bg);
		padding: 0.375rem 0.5rem;
	}

	/* Carta requires a monospace font (textarea positioning depends on it) */
	.md-editor-pane :global(.carta-font-code) {
		font-family: var(--font-mono);
		font-size: 0.9375rem;
		line-height: 1.7;
		letter-spacing: normal;
	}

	.md-editor-pane :global(.carta-input) {
		overflow-y: auto;
	}
</style>
