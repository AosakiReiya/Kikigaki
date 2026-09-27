// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare module '*.txt?raw' {
	const content: string;
	export default content;
}

declare global {
	interface Window {
		turnstile?: {
			render(container: HTMLElement, opts: Record<string, unknown>): string;
			execute(widgetId: string): void;
			getResponse(widgetId: string): string | undefined;
			reset(widgetId: string): void;
			remove(widgetId: string): void;
		};
		onTurnstileLoad?: () => void;
	}

	namespace App {
		// interface Error {}
		interface Locals {
			user?: import('$lib/server/auth').SessionUser;
			/** Current locale (injected by paraglide middleware; undefined on excluded paths like admin) */
			locale?: import('$lib/paraglide/runtime').Locale;
		}
		interface PageData {
			meta?: import('$lib/meta').MetaInput;
			/** Restrict hreflang output locales (e.g. post pages list only translated locales); unset = all locales */
			hreflangLocales?: import('$lib/paraglide/runtime').Locale[];
		}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
				BUCKET: R2Bucket;
				/** Cloudflare Turnstile secret (Pages env var; verification auto-skipped when unset) */
				TURNSTILE_SECRET?: string;
				/** Allowed frontend hostnames (comma-separated, optional) */
				TURNSTILE_HOSTNAMES?: string;
				/** AI provider key encryption master key (Phase 18; AI layer refuses writes when unset) */
				AI_SECRET?: string;
				/** Shared secret for the scheduled-publish keepalive endpoint (/api/cron/publish-due); same-name GitHub Actions secret */
				CRON_SECRET?: string;
			};
			context: {
				waitUntil(promise: Promise<unknown>): void;
			};
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
