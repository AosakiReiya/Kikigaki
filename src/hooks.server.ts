import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { BCP47 } from '$lib/i18n';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { emit } from '$lib/plugins';
import { bootPlugins } from '$lib/plugins/server';

/** Security headers (Phase 28 W5): site-wide; Workshop preview uses a same-origin iframe so XFO is SAMEORIGIN */
const CSP = [
	"default-src 'self'",
	// SvelteKit serializes as inline scripts; Turnstile needs the Cloudflare verifier
	// unsafe-eval (Phase 42.6): three client-side compile sites (new Function) — workshop / post custom components / AI chat — are by design;
	//   the site already allows unsafe-inline (injection equals full JS execution), so opening eval adds ≈0 marginal risk; all code sources pass the admin trust chain.
	//   TODO Phase C: switch to server-side precompile + dynamic import of self modules, then remove this and evaluate nonces replacing unsafe-inline.
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
	"style-src 'self' 'unsafe-inline'",
	// i.ytimg.com: YouTube component facade thumbnails (Phase 46; a CSP allowlist miss caused blank screens)
	"img-src 'self' data: blob: https://i.ytimg.com",
	"font-src 'self' data:",
	"connect-src 'self'",
	"worker-src 'self' blob:",
	// youtube-nocookie: :::youtube playback iframe (component uses only the nocookie domain; keep the minimal set)
	'frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com',
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
	// enforce policy while reporting violations (/api/csp-report) — previously violations vanished silently, blank-screen incidents were unattributable
	'report-uri /api/csp-report'
].join('; ');

const handleSecurity: Handle = async ({ event, resolve }) => {
	event.setHeaders({
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'SAMEORIGIN',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
	});
	const res = await resolve(event);
	// dev (vite HMR/websocket origins vary) skips CSP to avoid noise; preview/production enforce fully
	if (!import.meta.env.DEV) res.headers.set('content-security-policy', CSP);
	return res;
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		// current locale for load / API use (URL strategy: path prefix > cookie > baseLocale)
		event.locals.locale = locale;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', BCP47[locale] ?? locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleAuth: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Agent API (Phase 23) + admin-only API (Phase 36): paths outside /admin need the same gate + JSON 401
	if (pathname.startsWith('/api/agent') || pathname.startsWith('/api/admin')) {
		const db = event.platform?.env.DB;
		const token = event.cookies.get(SESSION_COOKIE);
		const user = db ? await validateSession(db, token) : null;
		if (!user) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		event.locals.user = user;
	}

	if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/admin/setup') {
		const db = event.platform?.env.DB;
		const token = event.cookies.get(SESSION_COOKIE);
		const user = db ? await validateSession(db, token) : null;

		if (!user) {
			redirect(303, '/admin/login');
		}

		event.locals.user = user;
		// event (Phase 21): admin load broadcast (fire-and-forget, non-blocking)
		void emit('admin:loaded', { userId: user.id }, { db });
	}

	return resolve(event);
};

const handlePlugins: Handle = async ({ event, resolve }) => {
	// registry-driven enable gate (idempotent seed per isolate; 30s disabled cache)
	await bootPlugins(event.platform?.env.DB);
	return resolve(event);
};

/**
 * Phase 77: self-host (node) environments lack Cloudflare platform — the shim attached by the node
 * entry (node-shim/install.ts) fills in event.platform here;
 * on Cloudflare deployments event.platform always exists and the shim is always absent, so this hook is a zero-cost passthrough.
 */
const handlePlatformShim: Handle = ({ event, resolve }) => {
	// adapter-node sets platform.env=process.env (no DB) — detect self-host by presence of the DB binding
	const env = event.platform?.env as { DB?: unknown } | undefined;
	if (!env?.DB) {
		const shim = (globalThis as { __PLATFORM_SHIM__?: unknown }).__PLATFORM_SHIM__;
		if (shim) (event as { platform?: unknown }).platform = shim;
	}
	return resolve(event);
};

export const handle: Handle = sequence(
	handlePlatformShim,
	handleSecurity,
	handleParaglide,
	handlePlugins,
	handleAuth
);
