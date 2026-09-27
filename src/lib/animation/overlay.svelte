<script lang="ts">
	import { site } from '$lib/site';
</script>

<div class="transition-overlay" aria-hidden="true">
	<span class="overlay-brand">
		{#each site.title.split('') as ch, i (i)}
			<span class="overlay-char">{ch}</span>
		{/each}
	</span>
	<span class="overlay-loader">
		LOADING<span class="loader-cursor">▌</span>
	</span>
</div>

<div class="nav-loader" aria-hidden="true">
	LOADING<span class="loader-cursor">▌</span>
</div>

<style>
	.transition-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: var(--color-bg-elevated);
		border-bottom: 1px solid var(--color-line);
		transform: scaleY(0);
		transform-origin: bottom;
		pointer-events: none;
	}

	/* noise texture matches the site-wide body::after so the curtain blends into the site */
	.transition-overlay::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: var(--grain-opacity);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
	}

	.overlay-brand {
		display: flex;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(1.5rem, 4vw, 2.5rem);
		letter-spacing: -0.03em;
		color: var(--color-strong);
	}

	.overlay-char {
		display: inline-block;
	}

	.overlay-loader,
	.nav-loader {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.35em;
		text-transform: uppercase;
		color: var(--color-strong);
		opacity: 0;
	}

	/* partial-refresh (popstate / same-layer) floating hint: screen center, never covering header/footer */
	.nav-loader {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 105;
		pointer-events: none;
		white-space: nowrap;
	}

	.loader-cursor {
		animation: loader-blink 1s steps(2, start) infinite;
	}

	@keyframes loader-blink {
		to {
			visibility: hidden;
		}
	}
</style>
