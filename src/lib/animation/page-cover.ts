import { ensureGsap } from './core';
import type { Pace } from './nav-pace';
import { COVER_MAX, DURATION, EASE, PACE_MS } from './config';
import { fadeTargetFor, getVariant } from './routes';

/**
 * Cover immediately (non-blocking): called in beforeNavigate, spanning the whole "new page data load" period.
 * Returns a Promise resolving when the cover animation completes (the manager awaits it in afterNavigate,
 * ensuring scroll reset and the lift both happen after the screen is fully covered).
 *
 * - curtain variant (regular forward navigation): content fades out + curtain rises (brand text + LOADING loader)
 * - fade variant (popstate / admin / tags same-layer): fades out only #page-content (partial refresh,
 *   header/footer stay), with a small floating LOADING hint at screen center
 */
export function pageCover(
	fromPath: string,
	toPath: string,
	type: string,
	pace: Pace = 'full'
): Promise<void> {
	return new Promise<void>((resolve) => {
		try {
			const gsap = ensureGsap();
			const overlay = document.querySelector<HTMLElement>('.transition-overlay');
			// Phase 45: rapid pace takes the fade shortcut directly (no curtain to lift = fastest path)
			const variant =
				type === 'popstate' || pace === 'rapid' ? 'fade' : getVariant(fromPath, toPath);
			// fade targets: admin fades only the main area (sidebar stays), everything else fades the whole page content
			const content = document.querySelector<HTMLElement>(
				variant === 'fade' ? fadeTargetFor(toPath) : '#page-content'
			);
			if (!content) {
				resolve();
				return;
			}
			// Phase 45: kill entrance tweens left over from the previous page first — their last render tick
			// (incl. the clearProps wrap-up) may land one frame after this set, stomping autoAlpha 0 back to 1
			gsap.killTweensOf(content);

			const tl = gsap.timeline();
			let settled = false;
			const settle = () => {
				if (settled) return;
				settled = true;
				resolve();
			};
			// timeout fallback: force-complete on animation errors — navigation never sticks
			const guard = gsap.delayedCall(COVER_MAX, () => {
				tl.progress(1);
				settle();
			});
			tl.eventCallback('onComplete', () => {
				guard.kill();
				settle();
			});

			if (variant === 'fade') {
				tl.to(content, {
					autoAlpha: 0,
					duration: pace === 'rapid' ? PACE_MS.rapid.rise : DURATION.short,
					ease: EASE.in
				});
				const navLoader = document.querySelector<HTMLElement>('.nav-loader');
				if (navLoader)
					tl.fromTo(navLoader, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, '<0.1');
				return;
			}

			// on fast networks the new page's data may land instantly (<100ms); keeping content visible then
			// would be exposed above the not-yet-full curtain as the new page swaps in — so content hides at t=0,
			// the curtain rises in sync with a fast-start easing; pageEnter fades it in on entrance
			gsap.set(content, { autoAlpha: 0 });
			if (overlay) {
				tl.set(overlay, { transformOrigin: 'bottom' });
				tl.to(overlay, { scaleY: 1, duration: PACE_MS[pace].rise, ease: EASE.cover }, 0);
				// normal: resolves as soon as covered (brand text keeps playing under the curtain, never blocking the lift); full: resolves only after the complete show
				if (pace === 'normal') tl.call(settle);

				const brand = overlay.querySelector<HTMLElement>('.overlay-brand');
				const chars = overlay.querySelectorAll<HTMLElement>('.overlay-char');
				// on entrance the parent is hidden by page-enter (visibility:hidden),
				// every cover must reset the parent + chars, otherwise the brand text appears only once
				if (brand) tl.set(brand, { autoAlpha: 1 }, 0);
				if (chars.length) {
					tl.set(chars, { autoAlpha: 0, y: 24 }, 0);
					tl.to(
						chars,
						pace === 'full'
							? { autoAlpha: 1, y: 0, duration: 0.4, ease: EASE.out, stagger: 0.04 }
							: { autoAlpha: 1, y: 0, duration: 0.3, ease: EASE.out, stagger: 0.015 },
						pace === 'full' ? '+=0.1' : '<0.15'
					);
				}
				const loader = overlay.querySelector<HTMLElement>('.overlay-loader');
				if (loader) tl.fromTo(loader, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, '<0.25');
			}
		} catch {
			resolve();
		}
	});
}
