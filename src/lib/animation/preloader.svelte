<script lang="ts">
	import { onMount } from 'svelte';
	import { site } from '$lib/site';
	import { ensureGsap, SplitText } from './core';
	import { EASE, PRELOADER_MAX, prefersReducedMotion } from './config';
	import { markReady } from './ready';

	let el: HTMLElement | undefined = $state();
	let done = $state(false);

	const STORAGE_KEY = 'kikigaki-preloaded';

	onMount(() => {
		const isAdmin = window.location.pathname.startsWith('/admin');
		const skip = isAdmin || prefersReducedMotion() || sessionStorage.getItem(STORAGE_KEY) === '1';
		sessionStorage.setItem(STORAGE_KEY, '1');

		if (skip || !el) {
			done = true;
			document.documentElement.classList.remove('preloading');
			markReady();
			return;
		}

		const gsap = ensureGsap();
		const brand = el.querySelector<HTMLElement>('.preloader-brand');
		if (!brand) {
			done = true;
			document.documentElement.classList.remove('preloading');
			markReady();
			return;
		}

		const tl = gsap.timeline({
			onComplete: () => {
				done = true;
				document.documentElement.classList.remove('preloading');
				markReady();
				const content = document.querySelector<HTMLElement>('#page-content');
				if (content) {
					gsap.fromTo(
						content,
						{ autoAlpha: 0, y: 12 },
						{ autoAlpha: 1, y: 0, duration: 0.5, ease: EASE.soft }
					);
				}
			}
		});

		const split = new SplitText(brand, { type: 'chars', charsClass: 'preloader-char' });

		tl.from(split.chars, {
			autoAlpha: 0,
			y: 24,
			duration: 0.5,
			ease: EASE.out,
			stagger: 0.045
		});
		tl.to(el, { autoAlpha: 0, duration: 0.45, ease: EASE.inOut }, '+=0.35');

		// timeout guard: force-finish on slow networks / slow font loading
		gsap.delayedCall(PRELOADER_MAX, () => {
			if (!done) tl.progress(1);
		});

		// start after fonts are ready (avoids flicker) but don't block — timeout guards
		void document.fonts.ready;
	});
</script>

{#if !done}
	<div class="preloader" bind:this={el} aria-hidden="true">
		<span class="preloader-brand">{site.title}</span>
	</div>
{/if}

<style>
	.preloader {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
	}

	.preloader-brand {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(2rem, 6vw, 4rem);
		letter-spacing: -0.03em;
		color: var(--color-ink);
	}

	.preloader-brand :global(.preloader-char) {
		display: inline-block;
	}
</style>
