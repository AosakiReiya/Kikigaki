<script lang="ts">
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';
	import type { Locale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { menuDropdown } from '$lib/animation/menu';
	import { LOCALE_LABELS } from '$lib/i18n';

	let { variant = 'dropdown' }: { variant?: 'dropdown' | 'list' } = $props();

	const labels = LOCALE_LABELS;

	let open = $state(false);
	// SSR reads AsyncLocalStorage, client reads the URL (url strategy); refreshes naturally after navigation
	const current = $derived(getLocale());

	function switchTo(locale: Locale) {
		open = false;
		if (locale !== current) setLocale(locale);
	}

	$effect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && !t.closest('[data-locale-switcher]')) open = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if variant === 'list'}
	<div class="switcher-list">
		<p class="label">{m.locale_switcher()}</p>
		<div class="row">
			{#each locales as locale (locale)}
				<button
					type="button"
					class="chip"
					class:active={locale === current}
					onclick={() => switchTo(locale)}
				>
					{labels[locale]}
				</button>
			{/each}
		</div>
	</div>
{:else}
	<div class="locale-switcher" data-locale-switcher use:menuDropdown={{ open }}>
		<button
			type="button"
			class="nav-link icon-btn trigger"
			aria-expanded={open}
			aria-label={m.locale_switcher()}
			onclick={() => (open = !open)}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9"></circle>
				<path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>
			</svg>
		</button>
		<ul class="menu" role="menu" data-menu-panel inert={open ? undefined : true}>
			{#each locales as locale (locale)}
				<li role="none" data-menu-item>
					<button
						type="button"
						role="menuitemradio"
						class="item"
						class:active={locale === current}
						aria-checked={locale === current}
						onclick={() => switchTo(locale)}
					>
						<span>{labels[locale]}</span>
						{#if locale === current}<span class="check" aria-hidden="true">✓</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	/* --- dropdown (desktop Header) --- */
	.locale-switcher {
		position: relative;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		color: var(--color-ink-muted);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: color 0.2s ease;
	}

	.trigger:hover {
		color: var(--color-ink);
	}

	.menu {
		position: absolute;
		top: calc(100% + 0.75rem);
		right: 0;
		z-index: 60;
		list-style: none;
		margin: 0;
		padding: 0.375rem;
		min-width: 9.5rem;
		background: var(--color-bg-elevated);
		border: 1px solid var(--color-line);
		border-radius: 0.75rem;
		box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.35);
		/* initially collapsed: GSAP autoAlpha takes over (resident to support collapse animation) */
		visibility: hidden;
		opacity: 0;
	}

	.item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: none;
		border-radius: 0.5rem;
		background: none;
		color: var(--color-ink);
		font-family: inherit;
		font-size: 0.875rem;
		text-align: left;
		cursor: pointer;
	}

	.item:hover {
		background: color-mix(in srgb, var(--color-ink) 8%, transparent);
	}

	.item.active {
		color: var(--color-strong);
	}

	.check {
		font-size: 0.75rem;
	}

	/* --- list (mobile drawer) --- */
	.switcher-list {
		margin-top: 1rem;
	}

	.label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-muted);
		margin: 0 0 0.75rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-line);
		border-radius: 9999px;
		background: none;
		color: var(--color-ink-muted);
		font-family: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--color-strong);
		color: var(--color-ink);
	}

	.chip.active {
		border-color: var(--color-strong);
		color: var(--color-strong);
	}
</style>
