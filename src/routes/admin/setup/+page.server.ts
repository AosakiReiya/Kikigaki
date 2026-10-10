import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '$lib/server/auth';
import { hashPassword } from '$lib/server/password';
import type { D1Database } from '@cloudflare/workers-types';
import type { Actions, PageServerLoad } from './$types';

/**
 * Phase 75 — first-run admin creation: available only while the users table is empty (brand-new deployment).
 * Success = auto login; afterwards this page closes permanently (no public registration; extend accounts via scripts/create-admin.ts).
 */
async function hasAnyUser(db: D1Database): Promise<boolean> {
	const kit = getDb(db);
	const [row] = await kit.select({ id: users.id }).from(users).limit(1);
	return !!row;
}

export const load: PageServerLoad = async ({ platform, cookies }) => {
	const db = platform?.env.DB;
	if (!db) redirect(303, '/admin/login');
	if (await hasAnyUser(db)) redirect(303, '/admin/login');
	void cookies;
	return {};
};

export const actions: Actions = {
	default: async ({ request, platform, cookies }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { error: '資料庫未配置', username: '' });
		// Fast rejection; the conditional insert below also guards concurrent requests.
		if (await hasAnyUser(db))
			return fail(403, { error: '管理員已存在，setup 已關閉', username: '' });

		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm') ?? '');

		if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username))
			return fail(400, { error: '帳號限 2–32 字元（英數 . _ -）', username });
		if (password.length < 8) return fail(400, { error: '密碼至少 8 字元', username });
		if (password !== confirm) return fail(400, { error: '兩次密碼不一致', username });

		const id = crypto.randomUUID();
		const inserted = await db
			.prepare(
				"INSERT INTO users (id, username, password_hash, role, created_at) SELECT ?, ?, ?, 'admin', ? WHERE NOT EXISTS (SELECT 1 FROM users)"
			)
			.bind(id, username, await hashPassword(password), Date.now())
			.run();
		if (inserted.meta.changes !== 1)
			return fail(403, { error: '管理員已存在，setup 已關閉', username });
		const token = await createSession(db, id);
		cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
		redirect(303, '/admin');
	}
};
