import { error, json } from '@sveltejs/kit';
import {
	ensureDefaultTemplates,
	listTemplates,
	saveTemplate,
	type SaveTemplateInput
} from '$lib/server/email-templates';
import type { RequestHandler } from './$types';

/* * template list (GET) + create template (POST) */
export const GET: RequestHandler = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	await ensureDefaultTemplates(db);
	return json({ templates: await listTemplates(db) });
};

export const POST: RequestHandler = async ({ platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as SaveTemplateInput;
	if (!body.slug) return json({ errors: ['需要 slug'] }, { status: 400 });
	const r = await saveTemplate(db, body);
	if (!r.ok) return json({ errors: r.errors }, { status: 400 });
	return json({ ok: true, version: r.version, slug: body.slug });
};
