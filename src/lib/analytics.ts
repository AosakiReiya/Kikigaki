/**
 * Analytics client-side collection helpers (browser-only calls).
 * - session: random id in sessionStorage (one per browser session; not fingerprinting, invalid cross-site)
 * - UTM: entry-page utm_* cached in sessionStorage so attribution stays consistent for the session
 */
import { getLocale } from '$lib/paraglide/runtime';

const SESSION_KEY = 'kikigaki-analytics-session';
const UTM_KEY = 'kikigaki-analytics-utm';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

export interface AnalyticsBeacon {
	path: string;
	locale: string;
	session: string;
	ref?: string;
	utm?: Partial<Record<(typeof UTM_KEYS)[number], string>>;
}

function sessionId(): string {
	try {
		let s = sessionStorage.getItem(SESSION_KEY);
		if (!s) {
			s = crypto.randomUUID();
			sessionStorage.setItem(SESSION_KEY, s);
		}
		return s;
	} catch {
		return '';
	}
}

function utmParams(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
	try {
		const cached = JSON.parse(sessionStorage.getItem(UTM_KEY) ?? '{}') as Record<string, string>;
		const sp = new URLSearchParams(window.location.search);
		let changed = false;
		for (const key of UTM_KEYS) {
			const v = sp.get(key);
			if (v && cached[key] !== v) {
				cached[key] = v.slice(0, 128);
				changed = true;
			}
		}
		if (changed) sessionStorage.setItem(UTM_KEY, JSON.stringify(cached));
		return cached;
	} catch {
		return {};
	}
}

/** Full beacon payload for the current page (path must be the canonical, locale-prefix-free path) */
export function analyticsBeacon(path: string): AnalyticsBeacon {
	const utm = utmParams();
	return {
		path,
		locale: getLocale(),
		session: sessionId(),
		...(document.referrer ? { ref: document.referrer } : {}),
		...(Object.keys(utm).length > 0 ? { utm } : {})
	};
}
