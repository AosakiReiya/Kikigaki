import { error, json } from '@sveltejs/kit';
import {
	activateVersion,
	getTemplate,
	saveTemplate,
	setTemplateFlags
} from '$lib/server/email-templates';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, params }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const t = await getTemplate(db, params.slug);
	if (!t) error(404, '找不到範本');
	return json(t);
};

export const POST: RequestHandler = async ({ platform, params, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as {
		action?: 'save' | 'activate' | 'rollback' | 'flags';
		subject?: string;
		source?: string;
		changeNote?: string;
		version?: number;
		enabled?: boolean;
		isDefault?: boolean;
		locale?: string | null;
	};
	if (body.action === 'activate' || body.action === 'rollback') {
		const r = await activateVersion(db, params.slug, Number(body.version ?? 0), {
			forkAsNew: body.action === 'rollback'
		});
		return json(r, { status: r.ok ? 200 : 400 });
	}
	if (body.action === 'flags') {
		await setTemplateFlags(db, params.slug, { enabled: body.enabled, isDefault: body.isDefault });
		return json({ ok: true });
	}
	// default = save (new version)
	if (typeof body.subject !== 'string' || typeof body.source !== 'string')
		return json({ errors: ['缺少 subject/source'] }, { status: 400 });
	const r = await saveTemplate(db, {
		slug: params.slug,
		subject: body.subject,
		source: body.source,
		changeNote: body.changeNote,
		enabled: body.enabled,
		locale: body.locale
	});
	if (!r.ok) return json({ errors: r.errors }, { status: 400 });
	return json({ ok: true, version: r.version });
};
