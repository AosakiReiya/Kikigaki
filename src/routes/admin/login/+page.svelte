<script lang="ts">
	import { site } from '$lib/site';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>登入 — {site.title} Admin</title>
</svelte:head>

<div class="login">
	<form method="POST" class="login-card">
		<h1>{site.title}</h1>
		<p class="sub">Admin</p>

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<label>
			帳號
			<input type="text" name="username" autocomplete="username" required />
		</label>
		<label>
			密碼
			<input type="password" name="password" autocomplete="current-password" required />
		</label>

		<button type="submit">登入</button>
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
		gap: 1.25rem;
		border: 1px solid var(--color-line);
		border-radius: 1rem;
		padding: 2.5rem 2rem;
		background: var(--color-bg-elevated);
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
	}

	.sub {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin-top: -1rem;
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
		font-size: 1rem;
	}

	input:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 0;
		border-color: transparent;
	}

	button {
		margin-top: 0.5rem;
		padding: 0.75rem;
		border: none;
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-ink);
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	button:hover {
		opacity: 0.9;
	}

	.error {
		padding: 0.625rem 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid #b91c1c;
		color: #f87171;
		font-size: 0.875rem;
	}
</style>
