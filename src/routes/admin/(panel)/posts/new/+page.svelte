<script lang="ts"></script>

<svelte:head>
	<title>新建文章 — Admin</title>
</svelte:head>

<a class="back" href="/admin/posts">← 回文章列表</a>

<h1 class="title">新建文章</h1>
<p class="note">
	建立草稿後，會進入編輯器填寫標題與正文。Slug 由標題自動產生（可於日後保留；目前不可改）。
</p>

<form method="POST" action="?/create" class="form">
	<label class="field">
		<span class="label">標題</span>
		<input type="text" name="title" placeholder="例如：我對 CSS 動畫的十個誤解" required />
	</label>
	<button type="submit" class="primary">建立</button>
</form>

<style>
	.back {
		display: inline-block;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		text-decoration: none;
		margin-bottom: 1.25rem;
	}

	.back:hover {
		color: var(--color-ink);
	}

	.title {
		font-size: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.note {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
		margin-bottom: 1.5rem;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 32rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-size: 0.8125rem;
		color: var(--color-ink-muted);
	}

	input[type='text'] {
		background: var(--color-bg);
		border: 1px solid var(--color-line);
		border-radius: 0.625rem;
		padding: 0.625rem 0.875rem;
		color: var(--color-ink);
		font: inherit;
		font-size: 0.9375rem;
		box-sizing: border-box;
	}

	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
		border-color: transparent;
	}

	.primary {
		align-self: flex-start;
		appearance: none;
		border: 1px solid var(--color-accent);
		border-radius: 0.625rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font: inherit;
		font-size: 0.9375rem;
		padding: 0.625rem 1.5rem;
		cursor: pointer;
		font-weight: 600;
	}
</style>
