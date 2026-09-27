<script lang="ts">
	/**
	 * Content contract atom (Phase 20.5) — every theme must render post/page bodies through this component,
	 * preserving: `.prose` typography + `use:hydrateComponents` `.cc` placeholder mounting + entrance stagger.
	 * Reskins can swap the whole structure while the body pipeline stays put → content/components consistent across themes.
	 */
	import { stagger } from '$lib/animation/stagger';
	import { hydrateComponents } from '$lib/content/hydrate';

	let { html }: { html: string } = $props();
</script>

<div
	class="prose"
	use:stagger={{ target: ':scope > *', y: 16, each: 0.03 }}
	use:hydrateComponents={{ src: html }}
	data-animate="article-content"
>
	<!-- markdown-it render (html:false already defends against raw HTML); .cc placeholders handed to hydrate -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- content comes from controlled markdown-it, not untrusted input -->
	{@html html}
</div>
