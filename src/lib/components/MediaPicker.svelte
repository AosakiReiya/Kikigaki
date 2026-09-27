<script lang="ts">
	interface MediaFile {
		key: string;
		size: number;
		uploaded: string;
		url: string;
	}

	interface ListResponse {
		prefix: string;
		folders: string[];
		files: MediaFile[];
	}

	export interface MediaPickResult {
		key: string;
		url: string;
	}

	let {
		open,
		onPick,
		onClose
	}: {
		open: boolean;
		onPick: (result: MediaPickResult) => void;
		/* * closing is the parent's job (controlled component); children must not write open, or they detach from the prop and can't reopen */
		onClose: () => void;
	} = $props();

	let current = $state('');
	let folders = $state<string[]>([]);
	let files = $state<MediaFile[]>([]);
	let busy = $state(false);
	let error = $state('');
	let uploading = $state(false);

	const crumbs = $derived(current ? current.split('/').filter(Boolean) : []);

	async function load(prefix: string) {
		busy = true;
		error = '';
		try {
			const res = await fetch(`/api/media?prefix=${encodeURIComponent(prefix)}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as ListResponse;
			folders = data.folders;
			files = data.files;
		} catch (e) {
			error = `載入失敗：${e instanceof Error ? e.message : String(e)}`;
		} finally {
			busy = false;
		}
	}

	function navTo(next: string) {
		current = next;
		void load(next);
	}

	async function upload(e: Event) {
		const input = e.target as HTMLInputElement;
		const list = input.files;
		if (!list || list.length === 0) return;
		uploading = true;
		let ok = 0;
		for (const file of Array.from(list)) {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('folder', current);
			const res = await fetch('/api/media', { method: 'POST', body: fd });
			if (res.ok) ok++;
		}
		input.value = '';
		uploading = false;
		if (ok > 0) void load(current);
	}

	$effect(() => {
		if (open) {
			current = '';
			folders = [];
			files = [];
			error = '';
			void load('');
		}
	});
</script>

{#if open}
	<div class="picker-overlay" role="dialog" aria-modal="true" aria-label="媒體庫">
		<div class="picker">
			<div class="picker-head">
				<div class="picker-title">媒體庫</div>
				<div class="picker-crumbs">
					<button class="crumb" disabled={current === ''} onclick={() => navTo('')}>根目錄</button>
					{#each crumbs as crumb, i (crumb)}
						<span>/</span>
						<button
							class="crumb"
							onclick={() =>
								navTo(
									current
										.split('/')
										.filter(Boolean)
										.slice(0, i + 1)
										.join('/') + '/'
								)}>{crumb}</button
						>
					{/each}
				</div>
				<label class="up-btn">
					{uploading ? '上傳中…' : '上傳'}
					<input type="file" multiple accept="image/*" class="hidden" onchange={upload} />
				</label>
				<button class="close" onclick={onClose} aria-label="關閉">✕</button>
			</div>

			{#if error}<p class="err">{error}</p>{/if}

			<div class="picker-body">
				{#if busy}
					<p class="empty">載入中…</p>
				{:else}
					{#if folders.length > 0}
						<div class="folders">
							{#each folders as folder (folder)}
								<button class="folder" onclick={() => navTo(`${current}${folder}/`)}
									>📁 {folder}</button
								>
							{/each}
						</div>
					{/if}
					{#if files.length > 0}
						<div class="grid">
							{#each files as f (f.key)}
								{#if /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(f.key)}
									<button class="cell" onclick={() => onPick({ key: f.key, url: f.url })}>
										<img src={f.url} alt={f.key} loading="lazy" />
										<span class="name">{f.key.split('/').pop()}</span>
									</button>
								{:else}
									<button class="cell non-image" onclick={() => onPick({ key: f.key, url: f.url })}>
										<span>📄</span>
										<span class="name">{f.key.split('/').pop()}</span>
									</button>
								{/if}
							{/each}
						</div>
					{:else if folders.length === 0}
						<p class="empty">此資料夾為空。可先上傳。</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.picker-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgb(0 0 0 / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.picker {
		width: min(56rem, 100%);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 0.875rem;
		overflow: hidden;
	}

	.picker-head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--color-line);
		flex-wrap: wrap;
	}

	.picker-title {
		font-weight: 700;
	}

	.picker-crumbs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8125rem;
		flex: 1;
		min-width: 8rem;
		flex-wrap: wrap;
	}

	.crumb {
		appearance: none;
		border: none;
		background: none;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
	}

	.crumb:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
	}

	.crumb:disabled {
		opacity: 0.5;
	}

	.up-btn {
		font-size: 0.8125rem;
		padding: 0.3125rem 0.75rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.5rem;
		color: var(--color-accent-ink);
		background: var(--color-accent);
		cursor: pointer;
	}

	.hidden {
		display: none;
	}

	.close {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink);
		border-radius: 0.375rem;
		width: 2rem;
		height: 2rem;
		cursor: pointer;
	}

	.err {
		padding: 0.5rem 1rem;
		color: #ef4444;
		font-size: 0.8125rem;
	}

	.picker-body {
		padding: 1rem;
		overflow-y: auto;
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.875rem;
		text-align: center;
		padding: 2rem 0;
	}

	.folders {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.folder {
		appearance: none;
		border: 1px solid var(--color-line);
		background: var(--color-bg);
		color: var(--color-ink);
		padding: 0.375rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.folder:hover {
		border-color: var(--color-accent);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		gap: 0.75rem;
	}

	.cell {
		appearance: none;
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		background: var(--color-bg);
		padding: 0.375rem;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		align-items: center;
	}

	.cell:hover {
		border-color: var(--color-accent);
	}

	.cell img {
		width: 100%;
		aspect-ratio: 16 / 10;
		object-fit: cover;
		border-radius: 0.375rem;
	}

	.cell.non-image {
		aspect-ratio: 16 / 10;
		justify-content: center;
		font-size: 2rem;
	}

	.name {
		font-size: 0.6875rem;
		color: var(--color-ink-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}
</style>
