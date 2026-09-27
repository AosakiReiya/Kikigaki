<script lang="ts">
	import { scrambleIn } from '$lib/animation/text';
	let { index, children }: { index: string; children: import('svelte').Snippet } = $props();
</script>

<h2 class="section-heading" data-animate="section-heading">
	<span class="index" use:scrambleIn>{index}</span>
	{@render children()}
</h2>
