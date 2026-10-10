import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from './auth';
import { emit } from '$lib/plugins';

/** Security headers (Phase 28 W5): site-wide; Workshop preview uses a same-origin iframe so XFO is SAMEORIGIN */
const CSP = [
	"default-src 'self'",
	// SvelteKit serializes as inline scripts; Turnstile needs the Cloudflare verifier
	// Admin-authored custom components currently require runtime compilation.
	// Inline scripts and eval weaken XSS containment; replace them with precompiled
	// modules and nonces when the component platform supports that execution model.
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

export const handleSecurity: Handle = async ({ event, resolve }) => {
	event.setHeaders({
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'SAMEORIGIN',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
	});
	const res = await resolve(event);
	// dev (vite HMR/websocket origins vary) skips CSP to avoid noise; preview/production enforce fully
	if (!import.meta.env.DEV) {
		// Additional policies are enforced together; never discard an SVG sandbox.
		const routePolicy = res.headers.get('content-security-policy');
		res.headers.set('content-security-policy', routePolicy ? `${CSP}, ${routePolicy}` : CSP);
	}
	return res;
};

export const handleAuth: Handle = async ({ event, resolve }) => {
	// Authorize the matched route, not the raw URL: locale reroutes and encoded
	// characters otherwise let /en/admin and /a%64min bypass these checks.
	const pathname = event.route.id ?? event.url.pathname;
	const adminApi =
		/^\/api\/(?:agent|admin)(?:\/|$)/.test(pathname) ||
		pathname === '/api/media' ||
		pathname === '/api/upload';
	const adminPage =
		/^\/admin(?:\/|$)/.test(pathname) && pathname !== '/admin/login' && pathname !== '/admin/setup';
	if (adminApi || adminPage) {
		const origin = event.request.headers.get('origin');
		if (
			!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
			origin &&
			origin !== event.url.origin
		) {
			return new Response(JSON.stringify({ error: 'cross_origin_request' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	// Agent API (Phase 23) + admin-only API (Phase 36): paths outside /admin need the same gate + JSON 401
	if (adminApi) {
		const db = event.platform?.env.DB;
		const token = event.cookies.get(SESSION_COOKIE);
		const user = db ? await validateSession(db, token) : null;
		if (!user) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		if (user.role !== 'admin')
			return new Response(JSON.stringify({ error: 'forbidden' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		event.locals.user = user;
	}

	if (adminPage) {
		const db = event.platform?.env.DB;
		const token = event.cookies.get(SESSION_COOKIE);
		const user = db ? await validateSession(db, token) : null;

		if (!user) {
			redirect(303, '/admin/login');
		}
		if (user.role !== 'admin') return new Response('Forbidden', { status: 403 });

		event.locals.user = user;
		// event (Phase 21): admin load broadcast (fire-and-forget, non-blocking)
		void emit('admin:loaded', { userId: user.id }, { db });
	}

	const response = await resolve(event);
	if (adminApi || adminPage) response.headers.set('cache-control', 'private, no-store');
	return response;
};
