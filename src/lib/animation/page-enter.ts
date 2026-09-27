import { ensureGsap, Flip } from './core';
import type { Pace } from './nav-pace';
import { EASE, PACE_MS } from './config';
import { fadeTargetFor } from './routes';

/* * whether the overlay is covering (scaleY ≈ 1) */
function overlayCovering(overlay: HTMLElement): boolean {
	const gsap = ensureGsap();
	const scaleY = gsap.getProperty(overlay, 'scaleY');
	return typeof scaleY === 'number' && scaleY > 0.99;
}

/**
 * Find the target hidden by the "cover": curtain / full-page fade hide #page-content,
 * admin fade hides only the main area (.panel > .content). Animate only the actually-hidden one;
 * running fromTo on visible elements causes flicker.
 */
function hiddenCoverTarget(path: string): HTMLElement | null {
	const candidates: (HTMLElement | null)[] = [
		document.querySelector<HTMLElement>('#page-content'),
		document.querySelector<HTMLElement>(fadeTargetFor(path))
	];
	for (const el of candidates) {
		if (el && el.style.visibility === 'hidden') return el;
	}
	return null;
}

/**
 * Entrance animation: overlay lifts + new page content enters + (optional) Flip shared element.
 */
export function pageEnter(path: string, flipState: unknown, pace: Pace = 'full'): void {
	try {
		const gsap = ensureGsap();
		const overlay = document.querySelector<HTMLElement>('.transition-overlay');
		const content = hiddenCoverTarget(path);

		const enter = PACE_MS[pace].enter;
		const tl = gsap.timeline();

		if (overlay && overlayCovering(overlay)) {
			const brand = overlay.querySelector('.overlay-brand');
			if (brand) tl.to(brand, { autoAlpha: 0, duration: 0.15 }, 0);
			const loader = overlay.querySelector('.overlay-loader');
			if (loader) tl.to(loader, { autoAlpha: 0, duration: 0.15 }, 0);
			tl.set(overlay, { transformOrigin: 'top' });
			tl.to(overlay, { scaleY: 0, duration: enter, ease: EASE.inOut }, 0.05);
		}

		// partial refresh (fade): floating hints collapse along with it
		const navLoader = document.querySelector('.nav-loader');
		if (navLoader) tl.to(navLoader, { autoAlpha: 0, duration: 0.2 }, 0);

		if (content) {
			tl.fromTo(
				content,
				{ autoAlpha: 0, y: 20 },
				{ autoAlpha: 1, y: 0, duration: enter, ease: EASE.out, clearProps: 'transform' },
				'<0.12'
			);
		}

		// Flip shared element (card → post page)
		// note: no absolute: true — it removes the element from document flow during animation,
		// causing the page height to shrink temporarily and the browser to clamp the scroll position wrongly
		if (flipState) {
			const targets = document.querySelectorAll('#page-content [data-flip-id]');
			if (targets.length > 0) {
				Flip.from(flipState as Flip.FlipState, {
					targets,
					duration: PACE_MS[pace].flip,
					ease: 'power2.inOut',
					scale: true
				});
			}
		}

		// a11y: focus the new page title
		const heading = document.querySelector<HTMLElement>('#page-content h1');
		if (heading) {
			heading.setAttribute('tabindex', '-1');
			heading.focus({ preventScroll: true });
		}
	} catch {
		// entrance animation errors never affect the page itself
	}
}
