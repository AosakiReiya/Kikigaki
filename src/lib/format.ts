import { BCP47 } from '$lib/i18n';
import { getLocale } from '$lib/paraglide/runtime';

/** Format a date per current locale (2026-08-22 → August 22, 2026 / …) */
export function formatDate(iso: string, locale: string = BCP47[getLocale()]): string {
	const [y, m, d] = iso.split('-').map(Number);
	if (!y || !m || !d) return iso;
	return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(
		new Date(Date.UTC(y, m - 1, d))
	);
}
