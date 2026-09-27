/**
 * Card interaction layer (Phase 54): the single source of site-wide card hover JS effects.
 * Pure CSS effects (border/lift/spotlight skins) belong to card.css;
 * this only handles mouse-tracking 3D tilt + glow coordinates (--mx/--my).
 * Condition: fine pointer ∧ ¬prefers-reduced-motion; otherwise never mounted.
 */
import { prefersReducedMotion } from './config';
import { ensureGsap } from './core';

export type CardEffect = 'none' | 'text' | 'border' | 'lift' | 'glow' | 'glow-tilt';

/* * attach glow to a single card DOM (tilt ±3° + spotlight coordinates); returns cleanup, or null when conditions fail */
export function attachCardGlow(card: HTMLElement): (() => void) | null {
	if (prefersReducedMotion() || !matchMedia('(pointer: fine)').matches) return null;
	const gsap = ensureGsap();
	gsap.set(card, { transformPerspective: 900 });
	const rx = gsap.quickTo(card, 'rotationX', { duration: 0.45, ease: 'power3' });
	const ry = gsap.quickTo(card, 'rotationY', { duration: 0.45, ease: 'power3' });
	const move = (e: Event) => {
		const pe = e as PointerEvent;
		const r = card.getBoundingClientRect();
		const px = (pe.clientX - r.left) / r.width;
		const py = (pe.clientY - r.top) / r.height;
		ry((px - 0.5) * 6);
		rx(-(py - 0.5) * 6);
		card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
		card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
	};
	const leave = () => {
		rx(0);
		ry(0);
	};
	card.addEventListener('pointermove', move);
	card.addEventListener('pointerleave', leave);
	return () => {
		card.removeEventListener('pointermove', move);
		card.removeEventListener('pointerleave', leave);
		gsap.killTweensOf(card);
	};
}

/* * Svelte action (used by Card.svelte): mounted only for glow-family effects */
export function cardFx(node: HTMLElement, effect: CardEffect = 'none') {
	if (effect !== 'glow' && effect !== 'glow-tilt') return;
	const detach = attachCardGlow(node);
	return { destroy: () => detach?.() };
}
