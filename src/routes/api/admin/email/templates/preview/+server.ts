import { json } from '@sveltejs/kit';
import { compileEmail, usedVars, type EmailVars } from '$lib/email/compile';
import { sampleVars } from '$lib/server/email-templates';
import type { RequestHandler } from './$types';

/* * live compile preview (for the editor): returns HTML + errors + variables used */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		subject?: string;
		source?: string;
		vars?: EmailVars;
	};
	const vars = { ...sampleVars(), ...(body.vars ?? {}) };
	const r = compileEmail(String(body.source ?? ''), vars, String(body.subject ?? ''));
	return json({
		html: r.html,
		text: r.text,
		subject: r.subject,
		errors: r.errors,
		varsUsed: usedVars(String(body.source ?? '') + ' ' + String(body.subject ?? ''))
	});
};
