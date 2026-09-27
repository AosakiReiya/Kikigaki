import { ensureGsap, Flip, ScrollTrigger } from './core';
import { LOAD_MAX, prefersReducedMotion } from './config';
import { pageCover } from './page-cover';
import { initialPaceState, nextPace, type Pace } from './nav-pace';
import { pageEnter } from './page-enter';
import { killAllScrollTriggers, refreshScrollTriggers } from './scroll';

interface NavigationInfo {
	from: { url: URL } | null;
	to: { url: URL } | null;
	type: string;
}

let flipState: unknown = null;
let firstLoad = true;
let incomingIds = new Set<string>();
let transitioning = false;
// Phase 45 velocity adaptation: pace decides cover/enter durations (full = cinematic first jump / normal = lift as soon as covered / rapid = instant fade)
let paceState = initialPaceState();
let currentPace: Pace = 'full';

/* * the current in-flight navigation's "cover" Promise (done = the screen is fully covered/faded) */
let coverDone: Promise<void> | null = null;
/* * force-open fallback when loading sticks */
let coverGuard: { kill(): void } | null = null;

/* * Phase 50.7: same path, different query (/blog filters/pagination) = regional swap; fade out [data-swap-region], never the whole page */
let swapPending = false;
/* * 58.12: swap ownership coordinates — honor only THIS navigation's afterNavigate; expired flags must never be consumed */
let swapToHref = '';
/* * 58.12: end-state patrol — 600ms on, region still all-dark with no navigation in flight = pipeline residue; force restore */
let swapWatch: { kill(): void } | null = null;

function armSwapWatchdog(): void {
	swapWatch?.kill();
	try {
		const gsap = ensureGsap();
		swapWatch = gsap.delayedCall(0.6, () => {
			swapWatch = null;
			if (swapPending || transitioning) return;
			const region = document.querySelector<HTMLElement>('[data-swap-region]');
			if (!region) return;
			if (region.style.visibility === 'hidden' || parseFloat(region.style.opacity || '1') < 0.05) {
				gsap.killTweensOf(region);
				gsap.set(region, { autoAlpha: 1, y: 0, clearProps: 'transform' });
				hideSwapLoader();
			}
		});
	} catch {
		/* watchdog's own exceptions ignored: the 6s fallback still stands */
	}
}
/* * Phase 58.6: swap slow-loading mid-flight hint (surfaces only past 350ms; fast networks never notice) */
let swapLoaderCall: { kill(): void } | null = null;

/**
 * 58.9: the swap slow-loading hint = the global nav-loader (fixed, top z, unaffected by the region fade-out),
 * dynamically positioned at the visible center of [data-swap-region]; without a region it keeps the page-centered default.
 */
function positionSwapLoader(): void {
	const nl = document.querySelector<HTMLElement>('.nav-loader');
	if (!nl) return;
	const region = document.querySelector<HTMLElement>('[data-swap-region]');
	if (!region) {
		nl.style.left = '';
		nl.style.top = '';
		return;
	}
	const r = region.getBoundingClientRect();
	const visTop = Math.max(r.top, 72);
	const visBot = Math.min(r.bottom, window.innerHeight - 32);
	if (r.width > 0 && visBot > visTop) {
		nl.style.left = `${r.left + r.width / 2}px`;
		nl.style.top = `${(visTop + visBot) / 2}px`;
	}
}

function hideSwapLoader(): void {
	swapLoaderCall?.kill();
	swapLoaderCall = null;
	const nl = document.querySelector<HTMLElement>('.nav-loader');
	if (!nl || parseFloat(getComputedStyle(nl).opacity) <= 0) return;
	const gsap = ensureGsap();
	gsap.killTweensOf(nl);
	gsap.to(nl, {
		autoAlpha: 0,
		duration: 0.12,
		onComplete: () => {
			nl.style.left = '';
			nl.style.top = '';
		}
	});
}

/**
 * Phase 58.5: region keys — same-book chapters (/series/<book>/…) and same-path navigations count as one region.
 * Intra-region navigation = swap (left column pinned, content cross-fades), skipping the full-page cover.
 */
function regionKey(url: URL): string {
	const m = url.pathname.match(/\/series\/[^/]+/);
	return m ? m[0] : url.pathname;
}

// callbacks that run only after the transition pipeline settles (the new page's scroll triggers are built here,
// avoiding the "ScrollTrigger.refresh() recompute mid-entrance" race)
type SettledFn = () => void;
const settledHooks = new Set<SettledFn>();

/**
 * Run fn after the transition has fully settled.
 * - outside a transition: run immediately
 * - during one: defer until the pipeline's refresh + final scroll settle
 */
export function whenSettled(fn: SettledFn): void {
	if (!transitioning) {
		fn();
	} else {
		settledHooks.add(fn);
	}
}

// the transition pipeline owns the scroll position (SvelteKit's native scroll reset would be disturbed by the onNavigate Promise)
const scrollPositions = new Map<string, number>();

/* * whether this element has a Flip pair "from the previous page" (if so the entrance animation yields to Flip) */
export function hasIncomingFlip(id: string | undefined): boolean {
	return !!id && incomingIds.has(id);
}

/* * hash navigation: scroll to the anchor element (fall back to top); always instant — never fights transition scrolling */
function scrollToHash(hash: string): void {
	try {
		const el = document.querySelector(decodeURIComponent(hash));
		if (el) {
			el.scrollIntoView({ behavior: 'instant' });
		} else {
			window.scrollTo({ top: 0, behavior: 'instant' });
		}
	} catch {
		window.scrollTo({ top: 0, behavior: 'instant' });
	}
}

/* * when a stuck load / navigation exception is abandoned, force the curtain open and release waiting hooks */
function forceReveal(): void {
	coverDone = null;
	if (coverGuard) {
		coverGuard.kill();
		coverGuard = null;
	}
	transitioning = false;

	const gsap = ensureGsap();
	const overlay = document.querySelector<HTMLElement>('.transition-overlay');
	if (overlay) gsap.set(overlay, { scaleY: 0 });
	document.querySelectorAll('.overlay-char, .overlay-loader, .nav-loader').forEach((el) => {
		gsap.set(el, { autoAlpha: 0 });
	});
	// both possible cover targets get reset (curtain / full-page fade hides #page-content; admin fade hides the main area)
	document.querySelectorAll<HTMLElement>('#page-content, .panel > .content').forEach((el) => {
		gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform' });
	});
	// 58.12: the fallback also scans swap regions (a reused <main> instance may keep an inline 0)
	document.querySelectorAll<HTMLElement>('[data-swap-region]').forEach((el) => {
		gsap.killTweensOf(el);
		gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'transform' });
	});

	// release the deferred hooks (the new page may not be mounted yet; each hook tolerates that internally)
	const hooks = [...settledHooks];
	settledHooks.clear();
	hooks.forEach((fn) => {
		try {
			fn();
		} catch {
			// one hook failing doesn't affect the others
		}
	});
}

/**
 * Transition pipeline: call once in +layout.svelte.
 * - **beforeNavigate (instant on click)**: cover with the curtain / fade content immediately (see page-cover),
 *   spanning the new page's data load → instant feedback even on slow networks
 * - afterNavigate: handle scrolling and lift the entrance only after the cover completes
 *
 * Design iron rules:
 * 1. **animation errors never block navigation** — everything wrapped in try/catch; no navigation locks that could stick
 * 2. **the pipeline owns scrolling** — positions reset/restored during the cover; entrance animations always start from the right place
 */
export function initTransitions(
	beforeNavigate: (cb: (nav: NavigationInfo) => void) => void,
	afterNavigate: (cb: (nav: NavigationInfo) => void) => void
): void {
	// disable the browser's native scroll restoration to avoid fighting the pipeline (reload starts from the top)
	history.scrollRestoration = 'manual';

	beforeNavigate(({ from, to, type }) => {
		if (!from || !to) return;
		if (regionKey(from.url) === regionKey(to.url)) {
			// swap: same region (same path, changed query = /blog filters; same book, new chapter = /series) non-hash → fade out only the content area
			if (
				(from.url.pathname === to.url.pathname && to.url.search === from.url.search) ||
				to.url.hash
			)
				return;
			if (prefersReducedMotion()) return;
			const region = document.querySelector<HTMLElement>('[data-swap-region]');
			if (!region) return;
			try {
				const gsap = ensureGsap();
				gsap.killTweensOf(region);
				gsap.to(region, { autoAlpha: 0, y: 12, duration: 0.22, ease: 'power2.in' });
				swapPending = true;
				swapToHref = to.url.href;
				armSwapWatchdog();
				swapLoaderCall?.kill();
				swapLoaderCall = gsap.delayedCall(0.35, () => {
					if (!swapPending) return;
					const nl = document.querySelector<HTMLElement>('.nav-loader');
					if (!nl) return;
					positionSwapLoader();
					gsap.killTweensOf(nl);
					gsap.fromTo(nl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 });
				});
				// navigation cancelled / exception fallback: if afterNavigate hasn't arrived in 6s, lift back open ourselves
				gsap.delayedCall(6, () => {
					if (!swapPending) return;
					const r = document.querySelector<HTMLElement>('[data-swap-region]');
					if (r) gsap.set(r, { clearProps: 'all' });
					hideSwapLoader();
					swapPending = false;
				});
			} catch {
				swapPending = false;
			}
			return;
		}

		// record the leaving page's scroll position (restored on back)
		scrollPositions.set(from.url.href, window.scrollY);

		// 58.12: a full-page navigation is taking over the screen — void stale swap flags in place + restore regions,
		// avoid a later afterNavigate wrongly taking the swap branch with nobody to lift the curtain (the real cause of click-spree → black page switches)
		if (swapPending) {
			swapPending = false;
			swapToHref = '';
			hideSwapLoader();
			armSwapWatchdog();
			try {
				const faded = document.querySelector<HTMLElement>('[data-swap-region]');
				if (faded) {
					const g = ensureGsap();
					g.killTweensOf(faded);
					g.set(faded, { autoAlpha: 1, y: 0, clearProps: 'transform' });
				}
			} catch {
				/* hand off to the curtain pipeline */
			}
		}

		if (prefersReducedMotion()) return;

		// velocity tiers: popstate (back) is fade anyway and doesn't count toward the sprint decision
		if (type === 'popstate') {
			currentPace = 'normal';
		} else {
			const r = nextPace(paceState, Date.now());
			paceState = r.state;
			currentPace = r.pace;
		}

		transitioning = true;

		try {
			ensureGsap();

			// clean up the current page's ScrollTriggers (the new page rebuilds its own)
			killAllScrollTriggers();

			// capture shared elements before leaving (page content only; the fixed Header excluded)
			const elements = document.querySelectorAll<HTMLElement>('#page-content [data-flip-id]');
			incomingIds = new Set(
				[...elements].map((el) => el.dataset.flipId).filter(Boolean) as string[]
			);
			flipState = elements.length > 0 ? Flip.getState(elements) : null;

			// cover immediately (non-blocking) — during slow networks the user sees the curtain + LOADING
			coverDone = pageCover(from.url.pathname, to.url.pathname, type, currentPace);

			// stuck-loading fallback: force the curtain open if afterNavigate hasn't arrived past LOAD_MAX
			const gsap = ensureGsap();
			if (coverGuard) coverGuard.kill();
			coverGuard = gsap.delayedCall(LOAD_MAX, () => {
				if (coverDone) forceReveal();
			});
		} catch {
			// animation pipeline error → navigate directly, never block
			flipState = null;
			incomingIds.clear();
			coverDone = null;
			transitioning = false;
		}
	});

	afterNavigate((navigation) => {
		if (firstLoad) {
			firstLoad = false;
			incomingIds.clear();
			ScrollTrigger.clearScrollMemory();
			refreshScrollTriggers();
			return;
		}

		// swap (same-region navigation): the content area is rebuilt by {#key} or left in faded-out state → a unified fade-in takes over
		if (swapPending && transitioning) {
			// 58.12: superseded mid-flight by a full-page navigation — void the swap and restore the region in place.
			// must restore: on route-instance reuse <main> is the same DOM node, keeping a residual inline autoAlpha 0
			// would compound onto the new page, while the full-page pipeline only flips #page-content and never reaches it.
			swapPending = false;
			swapToHref = '';
			try {
				const region = document.querySelector<HTMLElement>('[data-swap-region]');
				if (region) {
					const gsap = ensureGsap();
					gsap.killTweensOf(region);
					gsap.set(region, { autoAlpha: 1, y: 0, clearProps: 'transform' });
				}
			} catch {
				/* restoration failures handed to the curtain fallback */
			}
		} else if (swapPending && navigation.to?.url.href !== swapToHref) {
			// 58.12: a late/duplicate old swap after — don't steal the flag consumption; but if it IS the current committed page
			// (kit may replay only old events under the crash point, the real after missing) — fade in idempotently in place,
			// the "black screen after switching chapters" end-state is eradicated from here on.
			armSwapWatchdog();
			try {
				const cur = location.origin + location.pathname + location.search;
				if (navigation.to?.url.href === cur) {
					const region = document.querySelector<HTMLElement>('[data-swap-region]');
					if (region) {
						const gsap = ensureGsap();
						gsap.to(region, { autoAlpha: 1, y: 0, duration: 0.3, clearProps: 'transform' });
						hideSwapLoader();
					}
				}
			} catch {
				/* restoration left to the patrol / 6s fallback */
			}
			incomingIds.clear();
			ScrollTrigger.clearScrollMemory();
			refreshScrollTriggers();
			return;
		} else if (swapPending) {
			swapPending = false;
			hideSwapLoader();
			try {
				const region = document.querySelector<HTMLElement>('[data-swap-region]');
				if (region) {
					if (region.hasAttribute('data-swap-scrolltop')) window.scrollTo({ top: 0 });
					const gsap = ensureGsap();
					gsap.killTweensOf(region);
					// 58.12: idempotent fade-in (no forced fromTo 0-start anymore) — repeated/late events are harmless
					gsap.to(region, {
						autoAlpha: 1,
						y: 0,
						duration: 0.38,
						ease: 'power2.out',
						clearProps: 'transform'
					});
					// after a chapter switch, focus lands on the new chapter title ({#key} remount lags a frame → focus after rAF; no scrolling)
					const focusTarget = () =>
						region.querySelector<HTMLElement>('[data-swap-focus]')?.focus({ preventScroll: true });
					if (document.activeElement?.hasAttribute('data-swap-focus')) {
						// already focused (same component, not rebuilt)
					} else requestAnimationFrame(focusTarget);
				}
			} catch {
				/* animation exceptions ignored: content is already in place */
			}
			incomingIds.clear();
			ScrollTrigger.clearScrollMemory();
			refreshScrollTriggers();
			return;
		}

		if (prefersReducedMotion()) {
			// reduced-motion: the pipeline exits early; SvelteKit's native scroll handling works normally
			incomingIds.clear();
			refreshScrollTriggers();
			return;
		}

		// wait for the cover to complete before touching scroll and lifting (avoids visible scroll resets)
		const cover = coverDone;
		coverDone = null;
		if (coverGuard) {
			coverGuard.kill();
			coverGuard = null;
		}

		const run = () => {
			// --- scroll handling (the screen is fully covered by the curtain at this moment; resets go unseen) ---
			let applyScroll: () => void;
			if (navigation.type === 'popstate') {
				const saved = scrollPositions.get(navigation.to?.url.href ?? '') ?? 0;
				applyScroll = () => window.scrollTo({ top: saved, behavior: 'instant' });
			} else if (navigation.to?.url.hash) {
				const hash = navigation.to.url.hash;
				applyScroll = () => scrollToHash(hash);
			} else {
				applyScroll = () => window.scrollTo({ top: 0, behavior: 'instant' });
			}
			applyScroll();

			// clear the old page's residual scroll memory — otherwise the next refresh scrolls the page back to a wrong position
			// (ScrollTrigger refresh records and "restores" scroll positions; after SPA page switches that memory is dirty)
			ensureGsap();
			ScrollTrigger.clearScrollMemory();

			// wait for the new page's DOM before entering
			requestAnimationFrame(() => {
				try {
					pageEnter(window.location.pathname, flipState, currentPace);
				} finally {
					flipState = null;
					incomingIds.clear();

					// defer refresh: wait until scrolling fully settles so the refresh's internal scrolling can't interfere;
					// re-establish the target position after completion (final authority)
					const gsap = ensureGsap();
					gsap.delayedCall(0.25, () => {
						ScrollTrigger.clearScrollMemory();
						refreshScrollTriggers();
						applyScroll();

						// pipeline settled: release the new page's deferred scroll triggers
						transitioning = false;
						settledHooks.forEach((fn) => {
							try {
								fn();
							} catch {
								// one hook failing doesn't affect the others
							}
						});
						settledHooks.clear();
					});
				}
			});
		};

		if (cover) {
			cover.then(run).catch(run);
		} else {
			run();
		}
	});
}
