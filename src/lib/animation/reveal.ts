import type { Action } from 'svelte/action';
import { ensureGsap } from './core';
import { EASE, prefersReducedMotion } from './config';
import { whenReady } from './ready';
import { hasIncomingFlip, whenSettled } from './manager';

export interface RevealOptions {
	y?: number;
	duration?: number;
	delay?: number;
	start?: string;
}

/**
 * Single-element entrance: fade-up when scrolled into view (runs once).
 * Usage: <div use:reveal={{ y: 32 }}>
 *
 * Design: the initial from state applies at mount (invisible under the overlay),
 * but the ScrollTrigger is deferred until the transition pipeline settles (refresh + scroll finalized) —
 * avoiding a mid-entrance refresh() recompute stalling the animation halfway (elements stuck semi-transparent after SPA transitions).
 */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, opts = {}) => {
	if (prefersReducedMotion()) return;
	// yield when a Flip pair from the previous page exists — avoids double-animating the same element
	if (hasIncomingFlip(node.dataset.flipId)) return;

	const gsap = ensureGsap();
	const { y = 24, duration = 0.7, delay = 0, start = 'top 88%' } = opts;

	// hide to the from state immediately (applied at mount — avoids screen flicker)
	gsap.set(node, { autoAlpha: 0, y });

	let tween: ReturnType<typeof gsap.fromTo> | undefined;
	let destroyed = false;

	whenReady(() => {
		whenSettled(() => {
			if (destroyed) return;
			try {
				tween = gsap.fromTo(
					node,
					{ autoAlpha: 0, y },
					{
						autoAlpha: 1,
						y: 0,
						duration,
						delay,
						ease: EASE.out,
						scrollTrigger: { trigger: node, start, once: true }
					}
				);
			} catch {
				// creation failed → show directly (never hard-stuck)
				gsap.set(node, { clearProps: 'opacity,visibility,transform' });
			}
		});
	});

	return {
		destroy() {
			destroyed = true;
			tween?.scrollTrigger?.kill();
			tween?.kill();
		}
	};
};
