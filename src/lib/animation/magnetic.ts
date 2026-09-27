import type { Action } from 'svelte/action';
import { ensureGsap } from './core';
import { prefersReducedMotion } from './config';

export interface MagneticOptions {
	/* * snap strength (0–1, default 0.3) */
	strength?: number;
}

/**
 * Magnetic elements: pulled toward the cursor as the mouse nears, springing back on leave.
 * Desktop precise pointers only (pointer: fine); touch / reduced-motion auto-disable.
 * Usage: <button use:magnetic={{ strength: 0.25 }}>
 */
export const magnetic: Action<HTMLElement, MagneticOptions | undefined> = (node, opts = {}) => {
	if (prefersReducedMotion()) return;
	if (!window.matchMedia('(pointer: fine)').matches) return;

	const gsap = ensureGsap();
	const { strength = 0.3 } = opts;

	const xTo = gsap.quickTo(node, 'x', { duration: 0.4, ease: 'power3.out' });
	const yTo = gsap.quickTo(node, 'y', { duration: 0.4, ease: 'power3.out' });

	const onMove = (e: MouseEvent) => {
		const rect = node.getBoundingClientRect();
		const dx = e.clientX - (rect.left + rect.width / 2);
		const dy = e.clientY - (rect.top + rect.height / 2);
		xTo(dx * strength);
		yTo(dy * strength);
	};

	const onLeave = () => {
		xTo(0);
		yTo(0);
	};

	node.addEventListener('mousemove', onMove);
	node.addEventListener('mouseleave', onLeave);

	return {
		destroy() {
			node.removeEventListener('mousemove', onMove);
			node.removeEventListener('mouseleave', onLeave);
			gsap.killTweensOf(node);
		}
	};
};
