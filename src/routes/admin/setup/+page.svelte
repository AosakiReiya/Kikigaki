<script lang="ts">
	import { site } from '$lib/site';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>建立管理員 — {site.title}</title>
</svelte:head>

<div class="login">
	<form method="POST" class="login-card">
		<h1>{site.title}</h1>
		<p class="sub">首次部署 — 建立管理員</p>
		<p class="note">
			這是全站的第一個帳號，建立後即為管理員並自動登入；本頁隨即永久關閉（無公開註冊）。
		</p>

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<label>
			帳號（2–32 字元，英數 . _ -）
			<input
				type="text"
				name="username"
				value={form?.username ?? ''}
				autocomplete="username"
				required
			/>
		</label>
		<label>
			密碼（至少 8 字元）
			<input type="password" name="password" autocomplete="new-password" required minlength="8" />
		</label>
		<label>
			確認密碼
			<input type="password" name="confirm" autocomplete="new-password" required minlength="8" />
		</label>

		<button type="submit">建立並登入</button>
	</form>
</div>

<style>
	.login {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}
	.login-card {
		width: 100%;
		max-width: 24rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 2rem;
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		background: var(--color-bg-elevated);
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		text-align: center;
	}
	.sub {
		margin: -0.5rem 0 0;
		text-align: center;
		color: var(--color-ink-muted);
		font-size: 0.875rem;
	}
	.note {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
		padding: 0.625rem 0.75rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}
	input {
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-ink);
		font-size: 0.9375rem;
	}
	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 0;
		border-color: transparent;
	}
	.error {
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid #ef4444;
		border-radius: 0.5rem;
		color: #ef4444;
		font-size: 0.875rem;
	}
	button {
		padding: 0.625rem 1.5rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}
	button:hover {
		opacity: 0.9;
	}
</style>
