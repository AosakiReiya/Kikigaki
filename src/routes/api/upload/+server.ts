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
	['image/svg+xml', 'svg']
]);

/* * POST /api/upload — image upload to R2 (login required) */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const db = platform?.env.DB;
	const bucket = platform?.env.BUCKET;
	if (!db || !bucket) return new Response(null, { status: 503 });

	const user = await validateSession(db, cookies.get(SESSION_COOKIE));
	if (!user) return new Response(null, { status: 401 });

	let file: File;
	try {
		const form = await request.formData();
		const f = form.get('file');
		if (!(f instanceof File)) throw new Error('no file');
		file = f;
	} catch {
		return json({ error: '請提供檔案（欄位名 file）' }, { status: 400 });
	}

	if (file.size > MAX_SIZE) {
		return json({ error: '檔案過大（上限 10MB）' }, { status: 413 });
	}

	const ext = ALLOWED.get(file.type);
	if (!ext) {
		return json({ error: '不支援的檔案類型' }, { status: 415 });
	}

	const now = new Date();
	const key = `images/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

	await bucket.put(key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }
	});

	// public URL: requires enabling public access for the bucket in the Cloudflare dashboard or binding a custom domain
	return json({ key, url: `/${key}` }, { status: 201 });
};
