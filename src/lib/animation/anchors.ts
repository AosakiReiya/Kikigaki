import { browser } from '$app/environment';
import { prefersReducedMotion } from './config';

/**
 * In-page anchors (a[href="#id"]) smooth scroll — NOT via global `scroll-behavior: smooth`,
 * avoiding fights with the transition pipeline's programmatic (instant) scrolling.
 *
 * - smooth scroll; reduced-motion degrades to an instant jump
 * - creates no new history entry (replaceState updates the hash)
 * - missing anchors keep the browser's default behavior
 */
export function initSmoothAnchors(): () => void {
	if (!browser) return () => {};

	const onClick = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
		if (!anchor) return;
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
			return;
		}

		const id = anchor.getAttribute('href')!.slice(1);
		if (!id) return;
		const el = document.getElementById(id);
		if (!el) return;

		e.preventDefault();
		const behavior: ScrollBehavior = prefersReducedMotion() ? 'instant' : 'smooth';
		el.scrollIntoView({ behavior });
		history.replaceState(null, '', `#${id}`);
	};

	document.addEventListener('click', onClick);
	return () => document.removeEventListener('click', onClick);
}
