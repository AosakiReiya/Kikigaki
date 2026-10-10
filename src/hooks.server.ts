import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { BCP47 } from '$lib/i18n';
import { handleAuth, handleSecurity } from '$lib/server/security';
import { bootPlugins } from '$lib/plugins/server';

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
