import { themeBehavior } from '$lib/themes/behavior';

export type TransitionVariant = 'curtain' | 'fade';

/* * route → transition variant (same-layer navigations / internal admin use the fast fade; the rest follow theme behavior: curtain or fade) */
export function getVariant(from: string, to: string): TransitionVariant {
	if (
		(from.startsWith('/tags/') && to.startsWith('/tags/')) ||
		(from.startsWith('/admin') && to.startsWith('/admin'))
	) {
		return 'fade';
	}
	return themeBehavior().transition;
}

/**
 * fade variant's fade-out target: inside admin only the main area swaps (sidebar stays = a true partial refresh),
 * other same-layer navigations fade out the whole #page-content.
 */
export function fadeTargetFor(path: string): string {
	return path.startsWith('/admin') ? '.panel > .content' : '#page-content';
}
