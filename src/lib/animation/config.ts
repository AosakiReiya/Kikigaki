export const EASE = {
	in: 'power4.in',
	out: 'power4.out',
	inOut: 'power4.inOut',
	soft: 'power2.out',
	/* * curtain rise: fast start, covering from the very first frame */
	cover: 'power3.out'
} as const;

export const DURATION = {
	leave: 0.55,
	enter: 0.65,
	short: 0.3,
	flip: 0.7
} as const;

/* * cover animation timeout fallback (seconds) — force-complete on animation errors; navigation never blocks */
export const COVER_MAX = 1.6;

/* * max wait for a stuck navigation load (seconds) — past it the curtain is forced open, never stuck on the loading screen */
export const LOAD_MAX = 10;

export const PRELOADER_MAX = 2.2;

/* * Phase 45 velocity-tier timings (seconds): animation is rhythm, not a gate — lift as soon as covered; only slow networks hold */
export const PACE_MS = {
	/* * session's first jump: curtain + brand text, full cinema (lift only after cover completes) */
	full: { rise: 0.55, enter: 0.65, flip: 0.7 },
	/* * regular navigation: curtain slightly faster, lift as soon as covered (brand text keeps playing underneath) */
	normal: { rise: 0.42, enter: 0.5, flip: 0.6 },
	/* * fast click-sprees (post hunting): fade-only, near-instant */
	rapid: { rise: 0.18, enter: 0.28, flip: 0.45 }
} as const;

export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return true;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
