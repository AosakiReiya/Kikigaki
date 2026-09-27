/**
 * Capability authorization model — default-deny.
 * Components only get explicitly approved capabilities; everything else (cookies / admin / D1 / secrets / arbitrary network) is denied.
 * Pure functions + injected data here; the host (Sandbox.svelte) wires it up — easy to unit-test and reuse in a future Workshop.
 */

export interface PublicArticle {
	slug: string;
	title: string;
	summary: string;
	tags: { name: string; display: string }[];
}

export interface CapabilityContext {
	/** public post index only (same data as front-end searchIndex; no privacy) */
	articles: PublicArticle[];
	/** approved theme-token allowlist (colors/fonts only, nothing sensitive) */
	theme: Record<string, string>;
	/** origin allowlist for the fetch capability */
	allowedOrigins: string[];
	/** media path prefixes exposable (public R2 proxy) */
	assetPrefixes: string[];
}

export interface CapabilityResult {
	ok: boolean;
	data?: unknown;
	error?: string;
}

/** requestable capability list (referenced by docs/UI in sync) */
export const GRANTABLE = ['theme', 'article', 'assets', 'fetch'] as const;

/** explicit deny items for the PoC demo (validates default-deny) */
export const DENIED = ['cookie', 'storage', 'admin', 'db', 'secrets', 'top', 'parent'] as const;

const FETCH_TIMEOUT_MS = 8_000;
const FETCH_MAX_BYTES = 64 * 1024;

/** resolve one capability request; never throws — everything expressed as CapabilityResult */
export async function resolveCapability(
	name: string,
	params: unknown,
	ctx: CapabilityContext
): Promise<CapabilityResult> {
	switch (name) {
		case 'theme': {
			return { ok: true, data: ctx.theme };
		}
		case 'article': {
			const slug = readParam(params, 'slug');
			if (!slug) return { ok: false, error: 'params_invalid（需要 slug）' };
			const hit = ctx.articles.find((a) => a.slug === slug);
			return hit ? { ok: true, data: hit } : { ok: false, error: 'article_not_found' };
		}
		case 'assets': {
			const url = readParam(params, 'url');
			if (!url) return { ok: false, error: 'params_invalid（需要 url）' };
			const ok = ctx.assetPrefixes.some((prefix) => url.startsWith(prefix));
			return ok
				? { ok: true, data: { url } }
				: { ok: false, error: 'asset_not_in_approved_prefix' };
		}
		case 'fetch': {
			return approvedFetch(params, ctx);
		}
		default: {
			return { ok: false, error: 'capability_denied' };
		}
	}
}

async function approvedFetch(params: unknown, ctx: CapabilityContext): Promise<CapabilityResult> {
	const raw = readParam(params, 'url');
	if (!raw) return { ok: false, error: 'params_invalid（需要 url）' };
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, error: 'url_invalid' };
	}
	if (url.protocol !== 'https:') return { ok: false, error: 'only_https_allowed' };
	if (!ctx.allowedOrigins.includes(url.origin)) {
		return { ok: false, error: `origin_not_allowlisted（${url.origin}）` };
	}
	try {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
		const res = await fetch(url, { signal: ctrl.signal, redirect: 'error' });
		clearTimeout(timer);
		if (!res.ok) return { ok: false, error: `upstream_status_${res.status}` };
		const text = await res.text();
		if (text.length > FETCH_MAX_BYTES) {
			return { ok: false, error: 'response_too_large' };
		}
		try {
			return { ok: true, data: JSON.parse(text) };
		} catch {
			return { ok: true, data: text };
		}
	} catch (e) {
		return { ok: false, error: `fetch_failed（${e instanceof Error ? e.name : '?'}）` };
	}
}

function readParam(params: unknown, key: string): string | null {
	if (typeof params === 'string') return key === 'url' || key === 'slug' ? params : null;
	if (params && typeof params === 'object') {
		const v = (params as Record<string, unknown>)[key];
		if (typeof v === 'string') return v;
	}
	return null;
}
