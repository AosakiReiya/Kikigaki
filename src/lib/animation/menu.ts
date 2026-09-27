import type { Action } from 'svelte/action';
import { ensureGsap } from './core';
import { EASE, prefersReducedMotion } from './config';

export interface MenuDropdownOptions {
	/* * false = collapse playback (elements aren't rebuilt — avoids the CSS-initial-hidden flash frame) */
	open: boolean;
	/* * pass -50 when GSAP takes over the panel's horizontal centering (inline transforms override CSS translateX) */
	xPercent?: number;
}

/**
 * Dropdown open/close animation (mounted on the menu group container):
 * - [data-menu-panel]: panel fade-in + drop + slight scale (transform-origin top)
 * - [data-menu-item]: menu items enter in sequence (stagger)
 * - [data-menu-caret] (e.g. the ▾ arrow): flips 180° when open
 * - reduced-motion sets shown/hidden directly
 *
 * The panel must stay resident in the DOM (collapse controlled by autoAlpha).
 * Usage: <div use:menuDropdown={{ open }}><button><span data-menu-caret>▾</span></button><div data-menu-panel>…<a data-menu-item>…</a></div></div>
 */
export const menuDropdown: Action<HTMLElement, MenuDropdownOptions> = (node, options) => {
	const panel = node.querySelector<HTMLElement>('[data-menu-panel]');
	if (!panel) return {};

	const caret = node.querySelector<HTMLElement>('[data-menu-caret]');
	let opts = options ?? { open: false };

	if (prefersReducedMotion()) {
		const apply = (open: boolean) => {
			panel.style.visibility = open ? 'visible' : 'hidden';
			panel.style.opacity = open ? '1' : '0';
		};
		apply(opts.open);
		return {
			update(next: MenuDropdownOptions) {
				opts = next;
				apply(next.open);
			}
		};
	}

	const gsap = ensureGsap();
	const items = gsap.utils.toArray<HTMLElement>('[data-menu-item]', panel);
	let killItems: (() => void) | undefined;

	gsap.set(panel, {
		transformOrigin: 'top center',
		...(opts.xPercent !== undefined ? { xPercent: opts.xPercent } : {})
	});
	gsap.set(items, { autoAlpha: opts.open ? 1 : 0, y: opts.open ? 0 : 10 });
	gsap.set(caret, { rotate: opts.open ? 180 : 0 });

	function playOpen() {
		gsap.killTweensOf([panel, caret]);
		killItems?.();
		const tl = gsap
			.timeline({ defaults: { ease: EASE.out } })
			.fromTo(
				panel,
				{ autoAlpha: 0, y: -8, scale: 0.96 },
				{ autoAlpha: 1, y: 0, scale: 1, duration: 0.3 }
			)
			.to(caret, { rotate: 180, duration: 0.3 }, '<')
			.fromTo(
				items,
				{ autoAlpha: 0, y: 10 },
				{ autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.04 },
				'<0.06'
			);
		killItems = () => tl.kill();
	}

	function playClose() {
		gsap.killTweensOf([panel, caret]);
		killItems?.();
		// the item is already in the DOM (resident) — reset immediately so the next open never flashes the old state
		gsap.set(items, { autoAlpha: 0, y: 10 });
		gsap.to(panel, { autoAlpha: 0, y: -6, scale: 0.97, duration: 0.18, ease: EASE.in });
		gsap.to(caret, { rotate: 0, duration: 0.18, ease: EASE.inOut });
	}

	return {
		update(next) {
			const wasOpen = opts.open;
			opts = next;
			if (next.xPercent !== undefined) gsap.set(panel, { xPercent: next.xPercent });
			if (wasOpen === next.open) return;
			if (next.open) playOpen();
			else playClose();
		},
		destroy() {
			gsap.killTweensOf([panel, caret]);
			killItems?.();
		}
	};
};
