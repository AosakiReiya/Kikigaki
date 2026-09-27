/**
 * Cloudflare Turnstile verification (outermost protection layer).
 * The secret is passed by callers (read from platform.env on Cloudflare Pages).
 *
 * fail-closed policy:
 * - no secret and not production (dev) → skipped (submits allowed; local development)
 * - no secret and production (failClosed) → failed (403; no silent degradation)
 * - secret present → verify the token, passed / failed (reason attached for debugging)
 */
export const TURNSTILE_ACTION = 'submit_comment';

export interface TurnstileOptions {
	secret: string | undefined;
	/** allowed frontend hostnames (comma-separated). Unset = hostname not checked. */
	hostnames?: string;
	/** fail closed (return failed) when the secret is missing in production */
	failClosed?: boolean;
	/** test seam: override the siteverify endpoint (site DB key `turnstile_verify_url`, same pattern as GSC; unset in production = official URL) */
	verifyUrl?: string;
}

export type TurnstileResult =
	{ status: 'passed' } | { status: 'failed'; reason: string } | { status: 'skipped' };

export interface TurnstileVerifyResult {
	success: boolean;
	action?: string;
	hostname?: string;
	'error-codes'?: string[];
}

function normalizeHostnames(hostnames?: string): Set<string> {
	return new Set(
		(hostnames ?? '')
			.split(',')
			.map((h) => h.trim())
			.filter(Boolean)
	);
}

export async function verifyTurnstile(
	token: unknown,
	ip: string,
	opts: TurnstileOptions
): Promise<TurnstileResult> {
	if (!opts.secret) {
		// production missing the secret = misconfiguration; fail closed and log it
		if (opts.failClosed) {
			return { status: 'failed', reason: 'missing_secret_production' };
		}
		return { status: 'skipped' };
	}

	if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
		return { status: 'failed', reason: 'missing_or_invalid_token' };
	}

	let result: TurnstileVerifyResult;
	try {
		const res = await fetch(
			opts.verifyUrl ?? 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				signal: AbortSignal.timeout(10_000),
				body: new URLSearchParams({
					secret: opts.secret,
					response: token,
					remoteip: ip
				})
			}
		);
		if (!res.ok) return { status: 'failed', reason: `siteverify_http_${res.status}` };
		result = (await res.json()) as TurnstileVerifyResult;
	} catch (err) {
		return { status: 'failed', reason: `siteverify_network: ${String(err)}` };
	}

	if (!result.success) {
		return {
			status: 'failed',
			reason: `siteverify_rejected: ${(result['error-codes'] ?? []).join(',')}`
		};
	}

	if (result.action !== TURNSTILE_ACTION) {
		return {
			status: 'failed',
			reason: `action_mismatch: expected=${TURNSTILE_ACTION} got=${result.action ?? ''}`
		};
	}

	const allowed = normalizeHostnames(opts.hostnames);
	if (allowed.size > 0 && !allowed.has(result.hostname ?? '')) {
		return {
			status: 'failed',
			reason: `hostname_mismatch: expected=[${[...allowed].join(',')}] got=${result.hostname ?? ''}`
		};
	}

	return { status: 'passed' };
}
