import type { Action } from 'svelte/action';
import { ensureGsap, ScrollTrigger } from './core';
import { prefersReducedMotion } from './config';

/* * clean up all triggers on navigation leave (prevent residue) */
export function killAllScrollTriggers(): void {
	ensureGsap();
	ScrollTrigger.getAll().forEach((t) => t.kill());
}

/* * recompute trigger points after the new page enters */
export function refreshScrollTriggers(): void {
	ensureGsap();
	ScrollTrigger.refresh();
}

/**
 * Reading progress bar: scrubs scaleX with page scroll (element starts at scaleX(0)).
 * Usage: <div class="bar" use:progressBar>
 */
export const progressBar: Action<HTMLElement> = (node) => {
	if (prefersReducedMotion()) return;
	const gsap = ensureGsap();

	const trigger = node.closest('article') ?? document.documentElement;
	const tween = gsap.to(node, {
		scaleX: 1,
		ease: 'none',
		scrollTrigger: {
			trigger,
			start: 'top top',
			end: 'bottom bottom',
			scrub: true
		}
	});

	return {
		destroy() {
			tween.scrollTrigger?.kill();
			tween.kill();
		}
	};
};
