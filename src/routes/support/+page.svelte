<script lang="ts">
	/* * 79e-3 support page (exists only when surfaces include support). */
	import SupportZone from '$lib/components/SupportZone.svelte';
	import { page } from '$app/state';
</script>

<section class="sup">
	<h1>{page.data.settings?.name || ''}</h1>
	<SupportZone gate="support" />
</section>

<style>
	.sup {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(3.5rem, 10vh, 6rem) 1.5rem 4rem;
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 5vw, 2.6rem);
		text-align: center;
		letter-spacing: -0.02em;
	}
</style>
