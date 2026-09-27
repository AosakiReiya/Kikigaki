import type { Action } from 'svelte/action';
import { ensureGsap } from './core';
import { EASE, prefersReducedMotion } from './config';
import { whenReady } from './ready';
import { hasIncomingFlip } from './manager';

export interface MaskRevealOptions {
	duration?: number;
	delay?: number;
}

/**
 * Mask reveal: elements push up from below inside an overflow-hidden container (editorial heading entrance).
 * Usage: <div class="mask-reveal"><h1 use:maskReveal>...</h1></div>
 * (.mask-reveal lives in layout.css)
 *
 * Design: pushed outside the mask at mount (from state), sliding in only after ready — avoiding visible-then-repositioned flicker.
 */
export const maskReveal: Action<HTMLElement, MaskRevealOptions | undefined> = (node, opts = {}) => {
	if (prefersReducedMotion()) return;
	// yield when a Flip pair from the previous page exists — avoids double-animating the same element
	if (hasIncomingFlip(node.dataset.flipId)) return;

	const gsap = ensureGsap();
	const { duration = 0.9, delay = 0 } = opts;

	// push outside the mask immediately (applied at mount)
	gsap.set(node, { yPercent: 110 });

	let tween: ReturnType<typeof gsap.to> | undefined;

	whenReady(() => {
		try {
			tween = gsap.to(node, { yPercent: 0, duration, delay, ease: EASE.out });
		} catch {
			// animation failed → show directly (never hard-stuck)
			gsap.set(node, { clearProps: 'transform' });
		}
	});

	return {
		destroy() {
			tween?.kill();
		}
	};
};

/**
 * ScrambleText decode entrance (chapter labels and other short strings): once on viewport entry, gibberish converges to the text.
 * Requires ScrambleTextPlugin (ensureGsap already registers it).
 */
export const scrambleIn: Action<HTMLElement> = (node) => {
	if (prefersReducedMotion()) return;
	if (hasIncomingFlip(node.dataset.flipId)) return;
	const text = node.textContent ?? '';
	if (!text.trim()) return;
	const gsap = ensureGsap();
	gsap.set(node, { opacity: 0 });
	const tween = gsap.to(node, {
		opacity: 1,
		duration: 0.3,
		scrambleText: { text, chars: 'upperCase', speed: 0.5 },
		scrollTrigger: { trigger: node, start: 'top 92%', once: true }
	});
	return {
		destroy: () => {
			tween.scrollTrigger?.kill();
			tween.kill();
			gsap.set(node, { clearProps: 'opacity' });
		}
	};
};
