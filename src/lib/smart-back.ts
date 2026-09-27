import { goto } from '$app/navigation';

/**
 * Smart back (Phase 50.7): go back where you came from.
 * 1. arrived via in-site navigation (SvelteKit history index > 0) → history.back()
 * 2. direct open but same-site referrer available → navigate to the referrer
 * 3. external / no history → fallback (default /blog: a post's parent is the list, not the home page)
 */
export function smartBack(fallback = '/blog'): void {
	const index = Number(history.state?.['sveltekit:history'] ?? 0);
	if (index > 0) {
		history.back();
		return;
	}
	if (document.referrer) {
		try {
			const ref = new URL(document.referrer);
			if (ref.origin === location.origin) {
				void goto(ref.pathname + ref.search + ref.hash);
				return;
			}
		} catch {
			/* invalid referrer ignored; use fallback */
		}
	}
	void goto(fallback);
}
