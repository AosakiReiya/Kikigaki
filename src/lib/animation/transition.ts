import { ensureGsap } from './core';
import { EASE, prefersReducedMotion } from './config';

/**
 * Regional content swap transition: fade out old content → run update() to swap → fade in.
 * For "switching content within one page" scenarios (e.g. the post editor's locale tabs),
 * replacing full-page refreshes. reduced-motion swaps content with no animation.
 */
export async function swapContent(el: HTMLElement, update: () => void): Promise<void> {
	if (prefersReducedMotion()) {
		update();
		return;
	}
	const gsap = ensureGsap();
	gsap.killTweensOf(el);
	gsap.set(el, { y: 0 });
	await gsap.to(el, { autoAlpha: 0, y: 6, duration: 0.12, ease: EASE.in });
	update();
	await gsap.to(el, { autoAlpha: 1, y: 0, duration: 0.24, ease: EASE.out });
}
