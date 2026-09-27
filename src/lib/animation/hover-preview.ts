import type { Action } from 'svelte/action';
import { ensureGsap } from './core';
import { prefersReducedMotion } from './config';

/**
 * List hover cover preview: while the cursor is over rows carrying [data-preview-src],
 * a floating thumbnail follows the cursor; hidden when leaving the list.
 * Desktop precise pointers only; touch / reduced-motion auto-disable.
 * Usage: <ul use:hoverPreview>
 */
export const hoverPreview: Action<HTMLElement> = (node) => {
	if (prefersReducedMotion()) return;
	if (!window.matchMedia('(pointer: fine)').matches) return;

	const gsap = ensureGsap();

	const img = document.createElement('img');
	img.alt = '';
	img.setAttribute('aria-hidden', 'true');
	Object.assign(img.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '220px',
		aspectRatio: '16 / 9',
		objectFit: 'cover',
		borderRadius: '0.75rem',
		border: '1px solid var(--color-line)',
		pointerEvents: 'none',
		zIndex: '80',
		opacity: '0',
		visibility: 'hidden'
	});
	document.body.appendChild(img);

	const xTo = gsap.quickTo(img, 'x', { duration: 0.45, ease: 'power3.out' });
	const yTo = gsap.quickTo(img, 'y', { duration: 0.45, ease: 'power3.out' });

	let visible = false;

	const show = (src: string, e: PointerEvent) => {
		if (!img.src.endsWith(src)) img.src = src;
		if (!visible) {
			visible = true;
			gsap.set(img, { x: e.clientX + 24, y: e.clientY - 70 });
			gsap.to(img, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' });
		}
	};

	const hide = () => {
		if (!visible) return;
		visible = false;
		gsap.to(img, { autoAlpha: 0, scale: 0.92, duration: 0.25, ease: 'power2.in' });
	};

	const onMove = (e: PointerEvent) => {
		if (!visible) return;
		xTo(e.clientX + 24);
		yTo(e.clientY - 70);
	};

	const onOver = (e: PointerEvent) => {
		const target = (e.target as HTMLElement).closest<HTMLElement>('[data-preview-src]');
		const src = target?.dataset.previewSrc;
		if (src) {
			show(src, e);
		} else {
			hide();
		}
	};

	const onLeave = () => hide();

	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerover', onOver);
	node.addEventListener('pointerleave', onLeave);

	return {
		destroy() {
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerover', onOver);
			node.removeEventListener('pointerleave', onLeave);
			gsap.killTweensOf(img);
			img.remove();
		}
	};
};
