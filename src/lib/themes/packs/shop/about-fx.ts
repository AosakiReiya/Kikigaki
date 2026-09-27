/**
 * Advanced animation layer for the Portfolio about page (Phase 40.2).
 * Client-only, full prefers-reduced-motion degradation;
 * every action is built with gsap.context and returns a destroy restore (route-switch / HMR safe).
 *
 * 40.2 highlights: hero two-act "zero-overlap" handoff (whole content group exits → watermark/marquee take over from below),
 * manifesto rebuilt as a line-by-line light-up list, horizontal gallery reshaped with sticky (top bar + progress track + velocity skew),
 * SplitText always aria:'auto' for accessible restore.
 */
import { prefersReducedMotion } from '$lib/animation/config';
import { ensureGsap, ScrollTrigger, SplitText } from '$lib/animation/core';
import { attachCardGlow } from '$lib/animation/card-fx';

export { scrambleIn } from '$lib/animation/text';

type Gsap = ReturnType<typeof ensureGsap>;
type FxReturn = { destroy(): void } | undefined;

/** unified wrapper: reduced-motion degradation; context creation, destroy restore */
function fx(node: HTMLElement, build: (gsap: Gsap) => void): FxReturn {
	if (prefersReducedMotion()) return undefined;
	const gsap = ensureGsap();
	const ctx = gsap.context(() => {
		build(gsap);
	}, node);
	return { destroy: () => ctx.revert() };
}

/**
 * Hero two acts (zero-overlap handoff):
 * Act one (auto): avatar pops in → kicker letter-spacing tightens → name rises per char → tagline → socials → hint
 * Act two (pin + scrub): name/avatar/tagline **exit fully upward**, watermark & marquee **take over from below** —
 * only one protagonist group on screen at any moment.
 */
export function heroNarrative(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const name = node.querySelector('[data-name]');
		const avatar = node.querySelector('[data-avatar]');
		const kicker = node.querySelector('[data-kicker]');
		const tagline = node.querySelector('[data-tagline]');
		const socials = node.querySelector('[data-socials]');
		const hint = node.querySelector('[data-hint]');
		const bg = node.querySelector('[data-bg]');
		const wm = node.querySelector('[data-wm]');
		const inner = node.querySelector('.p-hero-inner');
		const marquee = document.querySelector('[data-marquee]');
		if (!name) return;
		const split = new SplitText(name, { type: 'chars', aria: 'auto' });
		const chars = split.chars;

		// initial state
		gsap.set(chars, { yPercent: 118, opacity: 0 });
		gsap.set(avatar, { scale: 0.4, opacity: 0 });
		gsap.set(kicker, { letterSpacing: '0.9em', opacity: 0 });
		gsap.set(tagline, { y: 18, opacity: 0 });
		gsap.set([socials, hint], { y: 24, opacity: 0 });
		if (wm) gsap.set(wm, { opacity: 0, letterSpacing: '0.05em', yPercent: 60 });

		// act one: entrance
		const intro = gsap.timeline({ delay: 0.15 });
		intro
			.to(avatar, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.8)' })
			.to(kicker, { letterSpacing: '0.34em', opacity: 1, duration: 0.6 }, '<0.1')
			.to(
				kicker,
				{
					scrambleText: { text: kicker?.textContent ?? '', chars: 'upperCase', speed: 0.6 },
					duration: 0.9,
					ease: 'none'
				},
				'<0.05'
			)
			.to(
				chars,
				{ yPercent: 0, opacity: 1, duration: 0.85, stagger: 0.045, ease: 'power4.out' },
				'<0.08'
			)
			.to(tagline, { y: 0, opacity: 1, duration: 0.6 }, '<0.35')
			.to(socials, { y: 0, opacity: 1, duration: 0.55, stagger: 0.06 }, '<0.12')
			.to(hint, { y: 0, opacity: 1, duration: 0.5 }, '<0.2');

		// act two: pin + scrub — first half withdraws the whole content group upward; second half brings watermark+marquee up from below
		const q = gsap.utils.selector(node);
		void q;
		const exit = gsap.timeline({
			scrollTrigger: {
				trigger: node,
				start: 'top top',
				end: '+=52%',
				scrub: 0.8,
				pin: true,
				pinSpacing: true
			}
		});
		// 0 → 40%: protagonist exits (moved out completely, no leftovers)
		// Phase 42: everything explicit fromTo — from is pinned to the intro's final state.
		// With to(), first-render timing (e.g. reload restored to the bottom → progress=1) would freeze from
		// at gsap.set's initial invisible values; scrolling back to the top would leave the whole act blank.
		exit
			.fromTo(
				chars,
				{ yPercent: 0, opacity: 1 },
				{ yPercent: -160, opacity: 0, stagger: 0.015, ease: 'none' },
				0
			)
			.fromTo(kicker, { y: 0, opacity: 1 }, { y: -70, opacity: 0, ease: 'none' }, 0)
			.fromTo(
				avatar,
				{ y: 0, scale: 1, opacity: 1 },
				{ y: -90, scale: 0.72, opacity: 0, ease: 'none' },
				0
			)
			.fromTo(tagline, { y: 0, opacity: 1 }, { y: -55, opacity: 0, ease: 'none' }, 0)
			.fromTo(socials, { y: 0, opacity: 1 }, { y: -35, opacity: 0, ease: 'none' }, 0)
			.fromTo(hint, { opacity: 1 }, { opacity: 0, ease: 'none' }, 0)
			.fromTo(bg, { scale: 1 }, { scale: 1.28, ease: 'none' }, 0);
		// 45% → 100%: successors enter (watermark + marquee slide in and settle)
		if (wm) {
			exit.fromTo(
				wm,
				{ opacity: 0, letterSpacing: '0.05em', yPercent: 60 },
				{ opacity: 0.1, letterSpacing: '0.34em', yPercent: 0, ease: 'none' },
				0.45
			);
		}
		if (inner) {
			exit.fromTo(inner, { yPercent: 0 }, { yPercent: -10, ease: 'none' }, 0.45);
		}
		if (marquee) {
			exit.fromTo(
				marquee,
				{ yPercent: 42, opacity: 0 },
				{ yPercent: 0, opacity: 1, ease: 'none' },
				0.5
			);
		}
		void intro;
	});
}

/** cursor-following glow (quickTo spring tracking; fine pointers only) */
export function spotlight(node: HTMLElement, sel = '[data-cursor]'): FxReturn {
	if (prefersReducedMotion() || !matchMedia('(pointer: fine)').matches) return undefined;
	const gsap = ensureGsap();
	const cur = node.querySelector(sel);
	if (!cur) return undefined;
	gsap.set(cur, { xPercent: -50, yPercent: -50, opacity: 0 });
	const qx = gsap.quickTo(cur, 'x', { duration: 0.6, ease: 'power3' });
	const qy = gsap.quickTo(cur, 'y', { duration: 0.6, ease: 'power3' });
	const show = (e: MouseEvent) => {
		const r = node.getBoundingClientRect();
		gsap.set(cur, { opacity: 1 });
		qx(e.clientX - r.left);
		qy(e.clientY - r.top);
	};
	const hide = () => gsap.to(cur, { opacity: 0, duration: 0.35 });
	node.addEventListener('mousemove', show);
	node.addEventListener('mouseleave', hide);
	return {
		destroy() {
			node.removeEventListener('mousemove', show);
			node.removeEventListener('mouseleave', hide);
			gsap.killTweensOf(cur);
		}
	};
}

/**
 * Infinite marquee: track loops at -50%; scroll-velocity modulated (faster scrolling = faster).
 * Hero act two takes over its yPercent/opacity first (handed back after the entrance settles).
 */
export function marquee(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const tracks = [...node.querySelectorAll<HTMLElement>('[data-mq]')];
		tracks.forEach((track, i) => {
			// standard marquee pattern: both rows use positive timeScale; the right row achieves the reverse visual via "start -50% → end 0%",
			// avoiding the whole-segment jump (flash) negative-timeScale playback causes when scroll direction reverses
			const left = i % 2 === 0;
			gsap.set(track, { xPercent: left ? 0 : -50 });
			const loop = gsap.to(track, {
				xPercent: left ? -50 : 0,
				duration: 26 + i * 8,
				ease: 'none',
				repeat: -1
			});
			gsap.to(loop, {
				timeScale: 1,
				scrollTrigger: {
					trigger: node,
					start: 'top bottom',
					end: 'bottom top',
					scrub: 0.6,
					onUpdate: (self) => {
						const vel = Math.min(3, 1 + Math.abs(self.getVelocity()) / 900);
						loop.timeScale(vel);
					}
				}
			});
		});
	});
}

/** giant stat numbers: the whole row rises from under a mask */
export function statsRise(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		gsap.set(node.children, { yPercent: 110, opacity: 0 });
		gsap.to(node.children, {
			yPercent: 0,
			opacity: 1,
			duration: 0.8,
			stagger: 0.09,
			ease: 'power3.out',
			scrollTrigger: { trigger: node, start: 'top 86%', once: true }
		});
	});
}

/**
 * Manifesto list line-by-line light-up (40.2 redesign):
 * each data-mrow: the big word lights first → the note follows (x slide-in + fade); inter-row hairlines unfold from the left.
 */
export function manifestoRows(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const rows = [...node.querySelectorAll('[data-mrow]')];
		if (!rows.length) return;
		rows.forEach((row) => {
			const word = row.querySelector('[data-mword]');
			const sub = row.querySelector('[data-msub]');
			const rule = row.querySelector('[data-mrule]');
			const index = row.querySelector('[data-mindex]');
			gsap.set(word, { yPercent: 60, opacity: 0 });
			gsap.set(sub, { x: 24, opacity: 0 });
			gsap.set(index, { opacity: 0, x: -12 });
			if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: 'left center' });
			const tl = gsap.timeline({
				scrollTrigger: { trigger: row, start: 'top 84%', end: 'top 55%', scrub: 0.6 }
			});
			tl.to(index, { opacity: 1, x: 0, duration: 0.3, ease: 'none' }, 0);
			tl.to(word, { yPercent: 0, opacity: 1, duration: 0.55, ease: 'power2.out' }, 0);
			if (rule) tl.to(rule, { scaleX: 1, duration: 0.5, ease: 'none' }, 0.05);
			tl.to(sub, { x: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.25);
		});
	});
}

/** section entrance: kicker line + title rise (shared by all sections) */
export function chapReveal(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const items = node.querySelectorAll('[data-chap-in]');
		if (!items.length) return;
		gsap.set(items, { y: 26, opacity: 0 });
		gsap.to(items, {
			y: 0,
			opacity: 1,
			duration: 0.7,
			stagger: 0.08,
			ease: 'power3.out',
			scrollTrigger: { trigger: node, start: 'top 86%', once: true }
		});
	});
}

/**
 * Horizontal pinned works gallery (sticky approach, final 40.2 form):
 * the outer layer is stretched by --wk-d, the inner layer pins with CSS sticky, track x is scrub-driven;
 * the bottom progress track scaleX and top-right counter advance in sync. Rebuilds automatically across breakpoints.
 */
export function hScroll(node: HTMLElement): FxReturn {
	if (prefersReducedMotion()) return undefined;
	let inner: FxReturn;
	const build = () => {
		inner?.destroy?.();
		inner = undefined;
		// Phase 42.3: mobile also enables the horizontal gallery (CSS sticky + scrub x works with touch); breakpoints only affect card width
		inner = fx(node, (gsap) => {
			const track = node.querySelector<HTMLElement>('[data-track]');
			const rail = node.querySelector<HTMLElement>('[data-rail]');
			if (!track) return;
			const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 96);
			const d = distance();
			if (d < 60) {
				node.style.removeProperty('--wk-d');
				return;
			}
			node.style.setProperty('--wk-d', `${Math.round(d * 1.35)}px`);
			gsap.set(track, { x: 0 });
			const tween = gsap.to(track, {
				x: () => -distance(),
				ease: 'none',
				scrollTrigger: {
					trigger: node,
					start: 'top top',
					end: () => `+=${distance() * 1.35}`,
					scrub: 0.7,
					invalidateOnRefresh: true,
					onUpdate: (self) => {
						if (rail) gsap.set(rail, { scaleX: self.progress });
						const tiltEls = track.querySelectorAll('[data-tilt]');
						const skew = gsap.utils.clamp(-5, 5, self.getVelocity() / -240);
						gsap.killTweensOf(tiltEls);
						// auto-straightens 0.35s after scrolling stops (avoids skew freezing at the last velocity)
						gsap.to(tiltEls, { skewY: skew, duration: 0.25, ease: 'none' });
						gsap.to(tiltEls, { skewY: 0, duration: 0.5, ease: 'power2.out', delay: 0.35 });
					}
				}
			});
			// keyboard ←/→: paginated scrolling when the section is in view (input focus not hijacked)
			const onKey = (e: KeyboardEvent) => {
				if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
				const tgt = e.target as HTMLElement | null;
				if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable))
					return;
				const st = tween.scrollTrigger;
				if (!st || !st.isActive) return;
				e.preventDefault();
				const step = (distance() / 3) * (e.key === 'ArrowRight' ? 1 : -1);
				window.scrollBy({ top: step, behavior: 'smooth' });
			};
			window.addEventListener('keydown', onKey);
			return {
				destroy() {
					window.removeEventListener('keydown', onKey);
					tween.scrollTrigger?.kill();
					tween.kill();
				}
			};
		});
	};
	build();
	const mq = matchMedia('(min-width: 1024px)');
	mq.addEventListener('change', build);
	return {
		destroy() {
			mq.removeEventListener('change', build);
			inner?.destroy?.();
		}
	};
}

/** tag cloud: font size scales with count + random pop-in */
export function flyWords(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const items = [...node.children] as HTMLElement[];
		items.forEach((el) => {
			const size = Number(el.dataset.size ?? 0);
			gsap.set(el, {
				fontSize: `${0.72 + size * 0.05}rem`,
				opacity: 0,
				x: () => gsap.utils.random(-90, 90),
				y: () => gsap.utils.random(-50, 60),
				scale: 0.4
			});
		});
		gsap.to(items, {
			opacity: 1,
			x: 0,
			y: 0,
			scale: 1,
			duration: 0.75,
			stagger: { amount: 0.5, from: 'random' },
			ease: 'back.out(2.2)',
			scrollTrigger: { trigger: node, start: 'top 85%', once: true }
		});
	});
}

/** text-line masks enter line by line */
export function splitLines(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const split = new SplitText(node, { type: 'lines', aria: 'auto' });
		if (!split.lines.length) return;
		gsap.set(split.lines, { yPercent: 112, opacity: 0 });
		gsap.to(split.lines, {
			yPercent: 0,
			opacity: 1,
			duration: 0.75,
			stagger: 0.08,
			ease: 'power3.out',
			scrollTrigger: { trigger: node, start: 'top 86%', once: true }
		});
	});
}

/** CTA rises per character on scrub */
export function ctaScrub(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const t = node.querySelector('[data-cta-t]');
		const btns = node.querySelectorAll('[data-cta-b] > *');
		const wm = node.querySelector('[data-cta-wm]');
		if (!t) return;
		const split = new SplitText(t, { type: 'chars', aria: 'auto' });
		gsap.set(split.chars, { yPercent: 115 });
		gsap.set(btns, { opacity: 0, scale: 0.7 });
		if (wm) gsap.set(wm, { yPercent: 50, opacity: 0 });
		gsap.to(split.chars, {
			yPercent: 0,
			ease: 'none',
			stagger: 0.05,
			scrollTrigger: { trigger: node, start: 'top 80%', end: 'center 55%', scrub: 0.6 }
		});
		gsap.to(btns, {
			opacity: 1,
			scale: 1,
			stagger: 0.1,
			ease: 'back.out(2.4)',
			scrollTrigger: { trigger: node, start: 'center 55%', end: 'center 32%', scrub: 0.6 }
		});
		if (wm) {
			gsap.to(wm, {
				yPercent: 0,
				opacity: 0.06,
				ease: 'none',
				scrollTrigger: { trigger: node, start: 'top bottom', end: 'bottom bottom', scrub: true }
			});
		}
	});
}

/** background parallax (data-bg) */
export function parallax(node: HTMLElement, amount = 12): FxReturn {
	return fx(node, (gsap) => {
		const bg = node.querySelector('[data-bg]');
		if (!bg) return;
		gsap.fromTo(
			bg,
			{ yPercent: -amount },
			{
				yPercent: amount,
				ease: 'none',
				scrollTrigger: { trigger: node, start: 'top bottom', end: 'bottom top', scrub: true }
			}
		);
	});
}

/** section nav rail: scrollspy highlighting (direct DOM manipulation; Svelte state untouched) */
export function chapRail(node: HTMLElement): FxReturn {
	const gsap = ensureGsap();
	const links = [...node.querySelectorAll<HTMLAnchorElement>('a[data-chap-link]')];
	if (!links.length) return undefined;
	const set = (i: number) => links.forEach((l, j) => l.classList.toggle('on', i === j));
	const ctx = gsap.context(() => {
		links.forEach((l, i) => {
			const t = document.querySelector(l.hash);
			if (!t) return;
			ScrollTrigger.create({
				trigger: t,
				start: 'top center',
				end: 'bottom center',
				onUpdate: (self) => {
					if (self.isActive) set(i);
				}
			});
		});
		set(0);
	}, node);
	return { destroy: () => ctx.revert() };
}

/** home hero gentle scroll parallax: content withdraws at 0.35x, watermark counter-moves half a beat slower (no fade; permanently legible) */
export function heroDrift(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const inner = node.querySelector<HTMLElement>('.hero-inner');
		const wm = node.querySelector<HTMLElement>('.hero-wm');
		const aurora = node.querySelector<HTMLElement>('.hero-aurora');
		const hint = node.querySelector<HTMLElement>('.scroll-hint');
		const tl = gsap.timeline({
			scrollTrigger: { trigger: node, start: 'top top', end: 'bottom top', scrub: 0.6 }
		});
		if (inner) tl.fromTo(inner, { yPercent: 0 }, { yPercent: -16, ease: 'none' }, 0);
		if (wm) tl.fromTo(wm, { yPercent: 0 }, { yPercent: 32, ease: 'none' }, 0);
		if (aurora) tl.fromTo(aurora, { yPercent: 0 }, { yPercent: 14, ease: 'none' }, 0);
		if (hint) tl.fromTo(hint, { opacity: 1 }, { opacity: 0, duration: 0.5, ease: 'none' }, 0);
	});
}

/**
 * Featured track cards (Phase 48): clip-path opens from below in a staggered entrance (once)
 * + per-card pointer tilt ±3° + cursor spotlight (CSS vars fed to :global ::after).
 * reduced-motion / coarse pointers degrade automatically: entrance still fades in once, but no tilt/spotlight.
 */
export function pinnedCards(node: HTMLElement): FxReturn {
	if (prefersReducedMotion()) return undefined;
	const gsap = ensureGsap();
	const items = [...node.querySelectorAll<HTMLElement>(':scope > li')];
	if (items.length === 0) return undefined;
	const cleanups: (() => void)[] = [];
	const ctx = gsap.context(() => {
		gsap.set(items, { y: 34, autoAlpha: 0, clipPath: 'inset(0 0 100% 0 round 1rem)' });
		ScrollTrigger.create({
			trigger: node,
			start: 'top 86%',
			once: true,
			onEnter: () =>
				gsap.to(items, {
					y: 0,
					autoAlpha: 1,
					clipPath: 'inset(-12% -12% -12% -12% round 1rem)',
					duration: 0.85,
					ease: 'power4.out',
					stagger: 0.1,
					clearProps: 'clipPath'
				})
		});
		for (const li of items) {
			const card = li.querySelector<HTMLElement>('.post-row') ?? li;
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

/** home tag cloud: uniform font size + one-by-one float-up entrance (no longer count-scaled since 43.1) */
export function tagCloudLite(node: HTMLElement): FxReturn {
	return fx(node, (gsap) => {
		const links = [...node.querySelectorAll<HTMLElement>('a')];
		if (!links.length) return;
		// 43.1: user feedback — removed font scaling (post count ≠ readability value); uniform design size, entrance only
		gsap.set(links, { y: 18, opacity: 0 });
		gsap.to(links, {
			y: 0,
			opacity: 1,
			duration: 0.5,
			stagger: 0.05,
			ease: 'power2.out',
			scrollTrigger: { trigger: node, start: 'top 88%', once: true }
		});
	});
}
