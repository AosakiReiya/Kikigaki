/**
 * CSP report sink (R2): collection point for browser report-only violations.
 * Keeps only essential fields in the worker log (structured, greppable), always 204;
 * any parse failure is silently swallowed — an observability endpoint must never hurt the page.
 */
import type { RequestHandler } from './$types';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { 'csp-report'?: Record<string, string> };
		const r = body?.['csp-report'] ?? {};
		// one summary line per entry; wrangler tail / Pages logs filter directly
		console.warn(
			`[csp-report] blocked="${r['blocked-uri'] ?? '?'}" directive="${r['violated-directive'] ?? '?'}" page="${r['document-uri'] ?? '?'}"`
		);
	} catch {
		/* beacon not JSON (truncated/aborted) = ignore */
	}
	return new Response(null, { status: 204 });
};
