import { resolve } from '$app/paths';
import { localizeHref } from '$lib/paraglide/runtime';

/** localize + resolve combined: use this for ALL internal links */
export function href(path: string): string {
	// localizeHref may return locale-prefixed paths outside the typed-routes literal type —
	// runtime behavior is correct; only a type cast is needed
	return (resolve as (id: string) => string)(localizeHref(path));
}
