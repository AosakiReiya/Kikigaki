/**
 * Agent UI motion toolbox (GSAP; transform/opacity only — everything runs on the compositor).
 * Unified prefers-reduced-motion gate: reduced motion completes instantly, no tweening.
 */
import { ensureGsap } from '$lib/animation/core';
import { prefersReducedMotion } from '$lib/animation/config';

const gsap = ensureGsap();

export function prefersReduced(): boolean {
	return prefersReducedMotion();
}

export function fabPop(el: HTMLElement): void {
	if (prefersReduced()) return;
	// animate opacity only (not transform/scale): avoids mid-tween scale≈0 being judged invisible
	gsap.from(el, {
		autoAlpha: 0,
		duration: 0.4,
		ease: 'power2.out',
		clearProps: 'opacity,visibility'
	});
}

/** "grows out of" the FAB rect (hand-rolled FLIP: transform only, never touches Svelte-managed left/top/width/height) */
