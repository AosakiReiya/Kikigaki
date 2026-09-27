<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="cz">
	<h1>{m.checkout_cancelled()}</h1>
</section>

<style>
	.cz {
		max-width: 40rem;
		margin: 0 auto;
		padding: clamp(5rem, 16vh, 10rem) 1.5rem;
		text-align: center;
	}
	h1 {
		font-family: Georgia, 'Noto Serif TC', 'Songti TC', serif;
		font-size: 1.5rem;
	}
</style>
