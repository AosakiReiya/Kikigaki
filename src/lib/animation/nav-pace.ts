/**
 * Navigation velocity tiers (Phase 45) — animation is visual rhythm, never a fixed reading roadblock.
 *
 * Three tiers:
 * - full: the session's first jump, full cinema (curtain + brand text show; lift only after cover completes)
 * - normal: regular navigation, lift as soon as the curtain covers (brand text keeps playing underneath, non-blocking)
 * - rapid: fast click-sprees (hunting-for-posts mode), straight to the fade shortcut, near-instant
 *
 * The deciding "gap" = distance between this click and the last: < RAPID_GAP_MS counts as a sprint;
 * after ≥ RAPID_STREAK accumulated, enter rapid (the first two fast jumps stay normal — avoids single misreads).
 * Pure function: state lives with the caller (manager); this only decides.
 */

export type Pace = 'full' | 'normal' | 'rapid';

export interface PaceState {
	navigations: number;
	lastNavAt: number;
	rapidStreak: number;
}

export const initialPaceState = (): PaceState => ({
	navigations: 0,
	lastNavAt: 0,
	rapidStreak: 0
});

/* * interval for detecting consecutive fast navigations */
export const RAPID_GAP_MS = 3000;
/* * consecutive fast navigations needed to upgrade to rapid */
export const RAPID_STREAK = 2;

export function nextPace(state: PaceState, now: number): { pace: Pace; state: PaceState } {
	const gap = now - state.lastNavAt;
	const rapidStreak = state.navigations > 0 && gap < RAPID_GAP_MS ? state.rapidStreak + 1 : 0;
	const pace: Pace =
		state.navigations === 0 ? 'full' : rapidStreak >= RAPID_STREAK ? 'rapid' : 'normal';
	return {
		pace,
		state: { navigations: state.navigations + 1, lastNavAt: now, rapidStreak }
	};
}
