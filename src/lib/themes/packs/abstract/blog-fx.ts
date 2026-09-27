/**
 * /blog exploration page animation layer (Phase 50.5).
 * Client-only, full prefers-reduced-motion degradation;
 * every action is built with gsap.context and returns a destroy restore (route-switch / HMR safe).
 */
import { prefersReducedMotion } from '$lib/animation/config';
import { ensureGsap, ScrollTrigger } from '$lib/animation/core';
import { attachCardGlow } from '$lib/animation/card-fx';

type Gsap = ReturnType<typeof ensureGsap>;
type FxReturn = { destroy(): void } | undefined;

function fx(node: HTMLElement, build: (gsap: Gsap) => void): FxReturn {
	if (prefersReducedMotion()) return undefined;
	const gsap = ensureGsap();
	const ctx = gsap.context(() => {
		build(gsap);
	}, node);
	return { destroy: () => ctx.revert() };
}

/**
 * Card grid entrance (batch: reveals only when scrolled to; animates across every page)
 * + per-card pointer tilt ±3° + --mx/--my spotlight (same vocabulary as the featured track; fine pointers only).
 */
export function blogGrid(node: HTMLElement): FxReturn {
	if (prefersReducedMotion()) return undefined;
	const gsap = ensureGsap();
	const items = [...node.querySelectorAll<HTMLElement>(':scope > li.post-row-item')];
	if (items.length === 0) return undefined;
	const cleanups: (() => void)[] = [];
	const ctx = gsap.context(() => {
		gsap.set(items, { y: 30, autoAlpha: 0, clipPath: 'inset(0 0 100% 0 round 1rem)' });
		ScrollTrigger.batch(items, {
			start: 'top 88%',
			once: true,
			onEnter: (batch) =>
				gsap.to(batch as HTMLElement[], {
					y: 0,
					autoAlpha: 1,
					clipPath: 'inset(-12% -12% -12% -12% round 1rem)',
					duration: 0.8,
					stagger: 0.07,
					ease: 'power4.out',
					overwrite: true,
					clearProps: 'clipPath'
				})
		});
		for (const li of items) {
			const card = li.querySelector<HTMLElement>('.post-row');
			if (!card) continue;
			const detach = attachCardGlow(card);
			if (detach) cleanups.push(detach);
		}
	}, node);
	return {
		destroy() {
			cleanups.forEach((fn) => fn());
			ctx.revert();
		}
	};
}

/** sidebar groups float in sequentially; tag/year items slide left + fade one by one */
export function blogSide(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const groups = [...node.querySelectorAll<HTMLElement>('[data-side-group]')];
		if (!groups.length) return;
		gsap.set(groups, { x: -18, autoAlpha: 0 });
		gsap.to(groups, {
			x: 0,
			autoAlpha: 1,
			duration: 0.6,
			stagger: 0.09,
			ease: 'power3.out',
			scrollTrigger: { trigger: node, start: 'top 90%', once: true }
		});
		const chips = groups.flatMap((g) => [...g.querySelectorAll<HTMLElement>('[data-side-item]')]);
		gsap.set(chips, { x: -10, autoAlpha: 0 });
		gsap.to(chips, {
			x: 0,
			autoAlpha: 1,
			duration: 0.45,
			stagger: 0.03,
			ease: 'power2.out',
			scrollTrigger: { trigger: node, start: 'top 90%', once: true }
		});
	});
}
