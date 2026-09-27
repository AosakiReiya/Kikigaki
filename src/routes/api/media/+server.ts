import { json } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['image/gif', 'gif'],
	['image/avif', 'avif'],
	['image/svg+xml', 'svg'],
	['text/markdown', 'md'],
	['application/pdf', 'pdf']
]);

/**
 * GET /api/media?prefix=images/2026/  — list folders and files (login required)
 * POST /api/media                      — upload to a folder (login required)
 * DELETE /api/media                    — delete files (keys) or a folder (prefix)
 */
export const GET: RequestHandler = async ({ platform, cookies, url }) => {
	const db = platform?.env.DB;
	const bucket = platform?.env.BUCKET;
	if (!db || !bucket) return json({ error: 'unavailable' }, { status: 503 });

	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) return json({ error: 'unauthorized' }, { status: 401 });

	const prefix = url.searchParams.get('prefix') ?? '';
	const listed = await bucket.list({ prefix, delimiter: '/' });

	const files = (listed.objects as { key: string; size: number; uploaded: Date }[]).map((o) => ({
		key: o.key,
		size: o.size,
		uploaded: o.uploaded.toISOString(),
		url: `/media/${o.key}`
	}));

	return json({
		prefix,
		folders:
			listed.delimitedPrefixes?.map((p: string) => p.slice(prefix.length).replace(/\/$/, '')) ?? [],
		files,
		truncated: listed.truncated
	});
};

export const POST: RequestHandler = async ({ platform, cookies, request }) => {
	const db = platform?.env.DB;
	const bucket = platform?.env.BUCKET;
	if (!db || !bucket) return json({ error: 'unavailable' }, { status: 503 });

	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) return json({ error: 'unauthorized' }, { status: 401 });

	let file: File;
	let folder = '';
	try {
		const form = await request.formData();
		const f = form.get('file');
		const dir = form.get('folder');
		if (typeof dir === 'string') folder = dir.replace(/^\/+|\/+$/g, '');
		if (!(f instanceof File)) throw new Error('no file');
		file = f;
	} catch {
		return json({ error: '請提供檔案（欄位名 file）與資料夾（folder，可省略）' }, { status: 400 });
	}

	// reject path traversal and empty folder segments
	if (folder.split('/').some((seg) => seg === '..' || seg === '.')) {
		return json({ error: '資料夾名稱不含 .. 或 .' }, { status: 400 });
	}

	if (file.size > MAX_SIZE) return json({ error: '檔案過大（上限 10MB）' }, { status: 413 });
	const ext = ALLOWED.get(file.type);
	if (!ext) return json({ error: '不支援的檔案類型' }, { status: 415 });

	// R2 key = {folder/}uuid.ext; public URLs always hang under /media/ (the media/[...key] route)
	const key = `${folder ? folder + '/' : ''}${crypto.randomUUID()}.${ext}`;
	// path sanitization: avoid empty folder segments
	const cleanKey = key.replace(/\/+/g, '/');

	await bucket.put(cleanKey, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }
	});

	return json({ key: cleanKey, url: `/media/${cleanKey}` }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ platform, cookies, request }) => {
	const db = platform?.env.DB;
	const bucket = platform?.env.BUCKET;
	if (!db || !bucket) return json({ error: 'unavailable' }, { status: 503 });

	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) return json({ error: 'unauthorized' }, { status: 401 });

	let keys: string[] | undefined;
	let prefix: string | undefined;
	try {
		const body = (await request.json()) as { keys?: string[]; prefix?: string };
		keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === 'string') : [];
		prefix = typeof body.prefix === 'string' && body.prefix ? body.prefix : undefined;
	} catch {
		return json({ error: 'request body 需為 JSON' }, { status: 400 });
	}

	if (prefix) {
		// delete a whole folder: list every object under the prefix, then delete
		let cursor: string | undefined;
		do {
			const listed = await bucket.list({ prefix, cursor });
			const objs = listed.objects.map((o) => o.key);
			if (objs.length > 0) await bucket.delete(objs);
			cursor = listed.truncated ? listed.cursor : undefined;
		} while (cursor);
	}

	if (keys && keys.length > 0) {
		await bucket.delete(keys);
	}

	return json({ ok: true, deleted: keys?.length ?? 0, folder: prefix ?? null });
};
