<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { cycleTheme, getThemePreference } from '$lib/stores/theme.svelte';
	import { magnetic } from '$lib/animation/magnetic';

	const preference = $derived(getThemePreference());
	const label = $derived(
		preference === 'light'
			? m.theme_light()
			: preference === 'dark'
				? m.theme_dark()
				: m.theme_auto()
	);
</script>

<button
	type="button"
	class="theme-toggle"
	use:magnetic={{ strength: 0.25 }}
	onclick={cycleTheme}
	aria-label={m.theme_toggle()}
	title={label}
	data-flip-id="theme-toggle"
>
	{#if preference === 'light'}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4.5" />
			<path
				d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1L5.3 5.3"
			/>
		</svg>
	{:else if preference === 'dark'}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
		</svg>
	{:else}
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<rect x="3" y="4.5" width="18" height="13" rx="1.5" />
			<path d="M9 21h6" />
		</svg>
	{/if}
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		color: var(--color-ink-muted);
		transition: color 0.2s ease;
		cursor: pointer;
	}

	.theme-toggle:hover {
		color: var(--color-ink);
	}

	.theme-toggle :global(svg) {
		width: 1.125rem;
		height: 1.125rem;
	}
</style>
