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
		cursor?: string;
		truncated: boolean;
	}

	let current = $state('');
	let folders = $state<string[]>([]);
	let files = $state<MediaFile[]>([]);
	let cursor: string | null = $state(null);
	let truncated = $state(false);
	let loading = $state(false);
	let error = $state('');
	let uploading = $state(false);
	let uploadNote = $state('');

	const crumbs = $derived(current ? current.split('/').filter(Boolean) : []);

	const formatBytes = (n: number) => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	};

	async function load(prefix: string, append = false) {
		loading = true;
		error = '';
		try {
			const res = await fetch(
				`/api/media?prefix=${encodeURIComponent(prefix)}&cursor=${encodeURIComponent(cursor ?? '')}`
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as ListResponse;
			folders = data.folders;
			files = append ? [...files, ...data.files] : data.files;
			truncated = data.truncated;
			cursor = data.truncated ? (data.cursor ?? '') : null;
		} catch (e) {
			error = `載入失敗：${e instanceof Error ? e.message : String(e)}`;
		} finally {
			loading = false;
		}
	}

	function navTo(next: string) {
		current = next;
		files = [];
		folders = [];
		cursor = null;
		truncated = false;
		void load(next);
	}

	function openFolder(name: string) {
		navTo(current ? `${current}${name}/` : `${name}/`);
	}

	function goToCrumb(idx: number) {
		const parts = current
			.split('/')
			.filter(Boolean)
			.slice(0, idx + 1);
		navTo(parts.length > 0 ? `${parts.join('/')}/` : '');
	}

	let initialized = false;
	$effect(() => {
		if (!initialized) {
			initialized = true;
			void load('');
		}
	});

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const list = input.files;
		if (!list || list.length === 0) return;

		uploading = true;
		uploadNote = '';
		error = '';
		let ok = 0;
		for (const file of Array.from(list)) {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('folder', current);
			try {
				const res = await fetch('/api/media', { method: 'POST', body: fd });
				if (res.ok) ok++;
				else {
					const j = (await res.json().catch(() => null)) as { error?: string } | null;
					throw new Error(j?.error ?? `HTTP ${res.status}`);
				}
			} catch (err) {
				error += `${file.name}: ${err instanceof Error ? err.message : String(err)}；`;
			}
		}
		input.value = '';
		uploading = false;
		uploadNote = ok > 0 ? `✓ 上傳 ${ok} 個檔案` : '';
		if (ok > 0) void load(current);
	}

	async function removeFile(file: MediaFile) {
		if (!confirm(`刪除 ${file.key} ？`)) return;
		try {
			const res = await fetch('/api/media', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ keys: [file.key] })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			files = files.filter((f) => f.key !== file.key);
		} catch (err) {
			error = `刪除失敗：${err instanceof Error ? err.message : String(err)}`;
		}
	}

	async function removeFolder(name: string) {
		const target = `${current}${name}/`;
		if (!confirm(`刪除整個資料夾 ${target}（含所有檔案）？此操作不可復原。`)) return;
		try {
			const res = await fetch('/api/media', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prefix: target })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			folders = folders.filter((f) => f !== name);
		} catch (err) {
			error = `刪除失敗：${err instanceof Error ? err.message : String(err)}`;
		}
	}

	async function copyUrl(key: string) {
		await navigator.clipboard.writeText(`/${key}`).catch(() => {});
		uploadNote = `已複製：/${key}`;
	}
</script>

<h1 class="title">媒體庫</h1>
<p class="note">
	檔案存於 R2（<code>blog-assets</code>），公開網址：<code>{'/{資料夾}/{檔名}'}</code
	>。資料夾即路徑前綴；可當作文章內嵌圖片與封面（poster）來源。
</p>

<div class="toolbar">
	<nav class="crumbs" aria-label="資料夾路徑">
		<button class="crumb root" disabled={current === ''} onclick={() => navTo('')}>根目錄</button>
		{#each crumbs as crumb, i (crumb)}
			<span class="sep">/</span>
			<button class="crumb" onclick={() => goToCrumb(i)}>{crumb}</button>
		{/each}
		{#if current}
			<span class="sep">/</span>
		{/if}
	</nav>

	<label class="upload-btn">
		{uploading ? '上傳中…' : current ? `上傳到 ${current}` : '上傳到根目錄'}
		<input
			type="file"
			multiple
			accept="image/*,.pdf,.md"
			class="hidden-input"
			onchange={handleUpload}
		/>
	</label>
</div>

{#if uploadNote}<p class="note ok">{uploadNote}</p>{/if}
{#if error}<p class="note err">{error}</p>{/if}

{#if loading && folders.length === 0 && files.length === 0}
	<p class="empty">載入中…</p>
{:else}
	{#if folders.length > 0}
		<h2 class="sub-title">資料夾</h2>
		<div class="folder-grid">
			{#each folders as folder (folder)}
				<div class="folder">
					<button class="folder-open" onclick={() => openFolder(folder)}>📁 {folder}</button>
					<button class="folder-del" onclick={() => removeFolder(folder)} title="刪除資料夾"
						>🗑</button
					>
				</div>
			{/each}
		</div>
	{/if}

	{#if files.length > 0}
		<h2 class="sub-title">{current ? current : '根目錄'}（{files.length}）</h2>
		<ul class="file-grid">
			{#each files as f (f.key)}
				<li class="file">
					{#if /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(f.key)}
						<a class="thumb" href={f.url} target="_blank" rel="noreferrer">
							<img src={f.url} alt={f.key} loading="lazy" />
						</a>
					{:else}
						<div class="thumb non-image">📄</div>
					{/if}
					<p class="fname" title={f.key}>{f.key.split('/').pop()}</p>
					<p class="fmeta">{formatBytes(f.size)}</p>
					<div class="factions">
						<button onclick={() => copyUrl(f.key)}>複製網址</button>
						<button class="danger" onclick={() => removeFile(f)}>刪除</button>
					</div>
				</li>
			{/each}
		</ul>
		{#if truncated}
			<button class="more" onclick={() => void load(current, true)}>載入更多…</button>
		{/if}
	{:else if !loading && folders.length === 0}
		<p class="empty">此資料夾為空。上傳檔案後會出現在這裡。</p>
	{/if}
{/if}

<style>
	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1.5rem;
	}

	.note code {
		font-family: var(--font-mono);
	}

	.note.ok {
		color: #22c55e;
	}

	.note.err {
		color: #ef4444;
		white-space: pre-wrap;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.crumbs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-wrap: wrap;
		font-size: 0.9375rem;
	}

	.crumb {
		appearance: none;
		background: none;
		border: none;
		color: var(--color-ink);
		font: inherit;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
	}

	.crumb:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-ink) 7%, transparent);
	}

	.crumb:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.sep {
		color: var(--color-ink-muted);
	}

	.upload-btn {
		display: inline-block;
		padding: 0.5rem 1rem;
		border: 1px solid var(--color-accent);
		border-radius: 0.625rem;
		color: var(--color-accent-ink);
		background: var(--color-accent);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.hidden-input {
		display: none;
	}

	.sub-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.25rem 0 0.75rem;
		color: var(--color-ink-muted);
	}

	.empty {
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}

	.folder-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.75rem;
	}

	.folder {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		background: var(--color-bg-elevated);
	}

	.folder-open {
		flex: 1;
		appearance: none;
		border: none;
		background: none;
		color: var(--color-ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.folder-open:hover {
		text-decoration: underline;
	}

	.folder-del,
	.factions button {
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		border-radius: 0.5rem;
		padding: 0.25rem 0.5rem;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.folder-del:hover,
	.factions button:hover {
		border-color: var(--color-ink);
		color: var(--color-ink);
	}

	.factions .danger:hover {
		border-color: #ef4444;
		color: #ef4444;
	}

	.file-grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.75rem;
	}

	.file {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 0.5rem;
		background: var(--color-bg-elevated);
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.thumb {
		display: block;
		aspect-ratio: 16 / 10;
		border-radius: 0.5rem;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-ink) 6%, transparent);
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.thumb.non-image {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
	}

	.fname {
		font-size: 0.8125rem;
		color: var(--color-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.fmeta {
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.factions {
		display: flex;
		gap: 0.375rem;
	}

	.more {
		margin-top: 1rem;
		appearance: none;
		border: 1px solid var(--color-line);
		background: none;
		color: var(--color-ink-muted);
		padding: 0.375rem 0.875rem;
		border-radius: 0.5rem;
		cursor: pointer;
	}

	.more:hover {
		border-color: var(--color-ink);
		color: var(--color-ink);
	}

	@media (max-width: 767px) {
		.file-grid {
			grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
		}
	}
</style>
