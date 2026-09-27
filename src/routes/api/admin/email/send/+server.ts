import { error, json } from '@sveltejs/kit';
import { bindEmail } from '../_util';
import { sendTestEmail } from '$lib/server/email';
import { sendTemplatedEmail, type TemplateType } from '$lib/server/email-templates';
import type { EmailVars } from '$lib/email/compile';
import type { RequestHandler } from './$types';

/* * test email (Phase 67a; template emails wired in 67b) */
export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	bindEmail(platform);
	const body = (await request.json().catch(() => ({}))) as {
		to?: string;
		slug?: string;
		type?: string;
		vars?: EmailVars;
		locale?: string;
	};
	const to = String(body.to ?? '').trim();
	if (!to) return json({ ok: false, error: '請填收件地址' }, { status: 400 });
	const r =
		body.slug || body.type
			? await sendTemplatedEmail(db, platform?.env.AI_SECRET, {
					to,
					slug: body.slug,
					type: (body.type ?? 'custom') as TemplateType,
					vars: body.vars ?? {},
					locale: body.locale
				})
			: await sendTestEmail(db, platform?.env.AI_SECRET, to);
	return json(r, { status: r.ok ? 200 : 400 });
};
