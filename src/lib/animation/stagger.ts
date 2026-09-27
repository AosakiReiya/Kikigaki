import type { Action } from 'svelte/action';
import { ensureGsap, ScrollTrigger } from './core';
import { EASE, prefersReducedMotion } from './config';
import { whenReady } from './ready';
import { whenSettled } from './manager';
import { themeBehavior } from '$lib/themes/behavior';

export interface StaggerOptions {
	/* * child selector (defaults to direct children) */
	target?: string;
	each?: number;
	y?: number;
}

/**
 * List batch entrance: children stagger fade-up when entering the viewport.
 * Usage: <ul use:stagger={{ target: 'li' }}>
 *
 * Design: targets hide to the from state at mount (SSR content never flashes first),
 * the batch is built only after the transition settles; entering the viewport fades in from the hidden state (.to, no fromTo re-zeroing).
 */
export const stagger: Action<HTMLElement, StaggerOptions | undefined> = (node, opts = {}) => {
	if (prefersReducedMotion()) return;
	const gsap = ensureGsap();
	const scale = themeBehavior().staggerScale;
	const { target = ':scope > *', each = 0.08, y = 32 } = opts;
	const effEach = each * scale;
	const effY = y * scale;

	const targets = node.querySelectorAll(target);
	if (targets.length === 0) return;

	// hide to the from state immediately (applied at mount — avoids visible-then-zeroed flicker after triggering)
	gsap.set(targets, { autoAlpha: 0, y: effY });

	let triggers: ScrollTrigger[] = [];

	whenReady(() => {
		whenSettled(() => {
			try {
				triggers = ScrollTrigger.batch(targets, {
					start: 'top 90%',
					once: true,
					onEnter: (batch) =>
						gsap.to(batch, {
							autoAlpha: 1,
							y: 0,
							duration: 0.7,
							ease: EASE.out,
							stagger: effEach,
							overwrite: true
						})
				}) as ScrollTrigger[];
			} catch {
				// creation failed → show directly (never hard-stuck)
				gsap.set(targets, { clearProps: 'opacity,visibility,transform' });
			}
		});
	});

	return {
		destroy() {
			triggers.forEach((t) => t.kill());
		}
	};
};
