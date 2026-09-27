<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import * as m from '$lib/paraglide/messages';
	import { formatDate } from '$lib/format';
	import { reveal } from '$lib/animation/reveal';
	import { stagger } from '$lib/animation/stagger';

	interface Comment {
		id: string;
		name: string;
		content: string;
		/* * Phase 70: replies — point only at top-level comments (one-level threads) */
		parentId: string | null;
		createdAt: string;
	}

	let { slug }: { slug: string } = $props();

	let comments = $state<Comment[]>([]);
	let loading = $state(true);
	let submitting = $state(false);
	let notice = $state<'idle' | 'approved' | 'pending' | 'error'>('idle');
	let errorMessage = $state('');

	let name = $state('');
	let email = $state('');
	let content = $state('');
	/* * reply mode: which top-level comment this hangs under (null = a regular comment) */
	let replyingTo = $state<{ id: string; name: string } | null>(null);
	// Honeypot: invisible to humans, bots fill it; the backend silently drops submissions with a value
	let website = $state('');
	/* * newsletter subscribe checkbox (double opt-in: a confirmation email follows submission) */
	let subscribe = $state(false);

	const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY ?? '';
	let turnstileContainer: HTMLDivElement | undefined = $state();
	let turnstileWidgetId: string | undefined = $state();
	let turnstileToken: string | undefined = $state();
	/* * verification passing ≠ publishing: the callback triggers submit only after the user has pressed send (armed)*/
	let autoSubmitArmed = false;
	let turnstileRendered = false;
	let turnstilePending = false;
	let turnstileScriptRequested = false;
	let tokenAt = 0;
	/* * Turnstile tokens are one-shot, expiring in ~300s → keep headroom */
	const TOKEN_TTL_MS = 240_000;

	function renderWidget(): void {
		if (!siteKey || turnstileRendered || !turnstileContainer) return;
		if (!window.turnstile) {
			turnstilePending = true;
			loadScript();
			return;
		}
		turnstileRendered = true;
		turnstileWidgetId = window.turnstile.render(turnstileContainer, {
			sitekey: siteKey,
			action: 'submit_comment',
			appearance: 'execute',
			callback: (token: string) => {
				turnstileToken = token;
				tokenAt = Date.now();
				// published only after the user explicitly submits; the automatic verification on page open only stores the token
				if (autoSubmitArmed) {
					autoSubmitArmed = false;
					void submit();
				}
			},
			'error-callback': (code: string) => {
				console.error('[comments] turnstile widget error:', code);
				turnstileToken = undefined;
				autoSubmitArmed = false;
				submitting = false;
				errorMessage = m.comment_error();
				notice = 'error';
			}
		});
	}

	function loadScript(): void {
		if (turnstileScriptRequested) return;
		turnstileScriptRequested = true;
		if (window.turnstile) {
			if (turnstilePending) {
				turnstilePending = false;
				renderWidget();
			}
			return;
		}
		window.onTurnstileLoad = () => {
			if (turnstilePending) {
				turnstilePending = false;
				renderWidget();
			}
		};
		const script = document.createElement('script');
		script.src =
			'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
		script.async = true;
		document.head.appendChild(script);
	}

	onMount(() => {
		return () => {
			delete window.onTurnstileLoad;
			if (turnstileWidgetId) window.turnstile?.remove(turnstileWidgetId);
			turnstileRendered = false;
			turnstileWidgetId = undefined;
			turnstileToken = undefined;
			turnstilePending = false;
		};
	});

	async function load() {
		try {
			const res = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`);
			if (res.ok) comments = await res.json();
		} catch {
			// comment load failures never affect reading
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void load();
	});

	/* * server reason code → localized message; unmatched ones show a generic error (raw code stays in console) */
	function errorMessageFor(reason: string): string {
		switch (reason) {
			case 'validation_name':
				return m.comment_error_name();
			case 'validation_content':
				return m.comment_error_content();
			case 'rate_limited':
				return m.comment_rate_limited();
			case 'validation_parent':
				return m.comment_error();
			default:
				return m.comment_error();
		}
	}

	function validate(): string | null {
		if (!name.trim()) return m.comment_error_name();
		if (!content.trim()) return m.comment_error_content();
		return null;
	}

	async function submit() {
		if (submitting) return;
		// pre-submit validation: name / content can't be empty (no longer relying on the browser; prompts are clearer too)
		const invalid = validate();
		if (invalid) {
			errorMessage = invalid;
			notice = 'error';
			return;
		}
		submitting = true;
		notice = 'idle';
		try {
			const res = await fetch('/api/comments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					slug,
					name,
					email,
					content,
					website,
					turnstileToken,
					parentId: replyingTo?.id ?? undefined
				})
			});
			if (res.ok) {
				const result = await res.json();
				// subscribe side effect: email left + checked → double opt-in confirmation (failure never affects the comment result)
				if (subscribe && email.trim()) {
					void fetch('/api/subscribe', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ email: email.trim(), name: name.trim(), source: 'comment_form' })
					}).catch(() => {});
				}
				if (result.approved === true) {
					notice = 'approved';
					content = '';
					replyingTo = null;
					await load();
				} else {
					notice = 'pending';
					content = '';
					replyingTo = null;
				}
			} else {
				const result = await res.json().catch(() => null);
				const reason = result?.reason ?? '';
				if (reason) {
					console.error('[comments] submit failed:', reason);
					errorMessage = errorMessageFor(reason);
				} else if (result?.error) {
					errorMessage = result.error;
				}
				notice = 'error';
			}
		} catch {
			notice = 'error';
		} finally {
			turnstileToken = undefined;
			autoSubmitArmed = false;
			if (turnstileWidgetId) {
				window.turnstile?.reset(turnstileWidgetId);
			}
			submitting = false;
		}
	}

	// one-level threads: top-level by time new→old; replies under their parent by time old→new
	const roots = $derived(
		comments.filter((c) => !c.parentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	);
	const repliesOf = (id: string): Comment[] =>
		comments
			.filter((c) => c.parentId === id)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		// validate before submitting: empty name/content get a local prompt directly, skipping Turnstile
		const invalid = validate();
		if (invalid) {
			errorMessage = invalid;
			notice = 'error';
			return;
		}
		if (siteKey) {
			// submit directly only with an unexpired token; otherwise arm → the callback submits after verification passes (arming needs an explicit user click)
			const fresh = turnstileToken && Date.now() - tokenAt < TOKEN_TTL_MS;
			if (fresh) {
				void submit();
				return;
			}
			autoSubmitArmed = true;
			if (!turnstileRendered) {
				renderWidget(); // appearance:'execute' → invisible verification auto-starts on render
			} else if (turnstileWidgetId) {
				window.turnstile?.execute(turnstileWidgetId); // already rendered → fetch a new token
			}
			return;
		}
		void submit();
	}
</script>

<section class="comments" aria-labelledby="comments-heading">
	<h2 id="comments-heading" class="title" use:reveal={{ y: 16, start: 'top 95%' }}>
		{m.comment_title()}
	</h2>

	{#if loading}
		<p class="muted">…</p>
	{:else if comments.length === 0}
		<p class="muted">{m.comment_empty()}</p>
	{:else}
		<!-- {#key} re-runs the entrance for lists loaded asynchronously (following the Search page pattern) -->
		{#key `${comments.length}:${comments[0]?.id ?? ''}`}
			<ul class="list" use:stagger={{ target: ':scope > li', y: 18, each: 0.05 }}>
				{#each roots as comment (comment.id)}
					<li class="item" id={`c-${comment.id}`}>
						<p class="meta">
							<strong>{comment.name}</strong>
							<time>{formatDate(comment.createdAt.slice(0, 10))}</time>
							<button
								type="button"
								class="reply-btn"
								onclick={() => (replyingTo = { id: comment.id, name: comment.name })}
							>
								{m.comment_reply()}
							</button>
						</p>
						<p class="body">{comment.content}</p>
						{#if repliesOf(comment.id).length}
							<ul class="replies">
								{#each repliesOf(comment.id) as reply (reply.id)}
									<li class="reply" id={`c-${reply.id}`}>
										<p class="meta">
											<strong>{reply.name}</strong>
											<time>{formatDate(reply.createdAt.slice(0, 10))}</time>
										</p>
										<p class="body">{reply.content}</p>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/key}
	{/if}

	<form class="form" onsubmit={onSubmit} onfocusin={renderWidget}>
		{#if replyingTo}
			<p class="reply-banner">
				{m.comment_reply_to({ name: replyingTo.name })}
				<button type="button" class="reply-btn" onclick={() => (replyingTo = null)}>
					{m.comment_cancel_reply()}
				</button>
			</p>
		{/if}
		<!-- Honeypot: invisible to humans; bots usually fill it -->
		<input
			type="text"
			class="hp"
			tabindex="-1"
			autocomplete="off"
			aria-hidden="true"
			bind:value={website}
		/>
		<div class="row">
			<label>
				{m.comment_name()}
				<input type="text" bind:value={name} maxlength="50" required />
			</label>
			<label>
				{m.comment_email()}
				<input type="email" bind:value={email} maxlength="100" />
				<span class="hint">{m.comment_email_hint()}</span>
			</label>
		</div>
		<label>
			{m.comment_content()}
			<textarea bind:value={content} maxlength="2000" rows="4" required></textarea>
		</label>
		<label class="subscribe">
			<input type="checkbox" bind:checked={subscribe} />
			<span>{m.comment_subscribe()}</span>
		</label>

		{#if siteKey}
			<div bind:this={turnstileContainer}></div>
		{/if}

		{#if notice === 'approved'}
			<p class="notice ok">{m.comment_approved()}</p>
		{:else if notice === 'pending'}
			<p class="notice ok">{m.comment_pending()}</p>
		{:else if notice === 'error'}
			<p class="notice bad">
				{m.comment_error()}
				{#if errorMessage}<span class="reason">{errorMessage}</span>{/if}
			</p>
		{/if}

		<button type="submit" disabled={submitting}>
			{submitting ? m.comment_submitting() : m.comment_submit()}
		</button>
	</form>
</section>

<style>
	.comments {
		max-width: 80rem;
		margin: clamp(3rem, 8vh, 5rem) auto 0;
		padding: 0 1.5rem;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}

	.muted {
		color: var(--color-ink-muted);
		font-size: 0.9375rem;
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.item {
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		padding: 1rem 1.25rem;
	}

	.meta {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.reply-btn {
		padding: 0.125rem 0.625rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		background: transparent;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition:
			color 0.2s ease,
			border-color 0.2s ease;
	}

	.reply-btn:hover {
		color: var(--color-ink);
		border-color: var(--color-ink);
	}

	.reply-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--color-line);
		border-radius: 0.5rem;
	}

	.replies {
		list-style: none;
		margin: 0.875rem 0 0;
		padding: 0 0 0 1.25rem;
		border-left: 2px solid var(--color-line);
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.reply {
		background: var(--color-bg-elevated);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
	}

	.hint {
		font-size: 0.75rem;
		opacity: 0.75;
	}

	.meta time {
		color: var(--color-ink-muted);
		font-size: 0.8125rem;
	}

	.body {
		font-size: 0.9375rem;
		color: var(--color-ink);
		white-space: pre-wrap;
		line-height: 1.7;
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 40rem;
	}

	.hp {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}

	input,
	textarea {
		padding: 0.625rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 0.5rem;
		background: var(--color-bg-elevated);
		color: var(--color-ink);
		font-size: 0.9375rem;
		font-family: inherit;
		resize: vertical;
	}

	input:focus,
	textarea:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: 0;
		border-color: transparent;
	}

	.subscribe {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-ink-muted);
	}

	.notice {
		font-size: 0.875rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
	}

	.notice.ok {
		color: #22c55e;
		border: 1px solid #22c55e;
	}

	.notice.bad {
		color: #ef4444;
		border: 1px solid #ef4444;
	}

	.reason {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		word-break: break-all;
	}

	button {
		align-self: flex-start;
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

	button:hover:not(:disabled) {
		opacity: 0.9;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 639px) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
