import { bindEmailSender } from '$lib/server/email';

type PlatformLike = { env?: Record<string, unknown> } | undefined;

/* * Cloudflare Email Sending binding (Workers Paid) probed and injected; other providers go over HTTPS and don't need it */
export function bindEmail(platform: PlatformLike): void {
	const email = platform?.env?.EMAIL as
		{ send: (msg: Record<string, unknown>) => Promise<void> } | undefined;
	bindEmailSender(email);
}
