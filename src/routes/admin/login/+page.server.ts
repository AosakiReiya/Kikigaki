import { eq } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { loginAttempts, users } from '$lib/server/db/schema';
import {
	SESSION_COOKIE,
	cleanupSessions,
	createSession,
	sessionCookieOptions,
	validateSession,
	verifyPassword
} from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, platform }) => {
	const db = platform?.env.DB;
	if (db) {
		const user = await validateSession(db, cookies.get(SESSION_COOKIE));
		if (user) redirect(303, '/admin');
		// Phase 75: brand-new deployment (no accounts at all) → first-run admin creation page
		const kit = getDb(db);
		const [first] = await kit.select({ id: users.id }).from(users).limit(1);
		if (!first) redirect(303, '/admin/setup');
	}
	return {};
};

// Rate limit (Phase 28 W5): same IP 5 hits per 15-minute window, D1-persisted (shared across isolates, survives restarts)
const LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Reserve an attempt atomically so parallel requests cannot bypass the IP limit. */
async function checkAndBump(db: NonNullable<App.Platform['env']['DB']>, ip: string, now: number) {
	const count = await db
		.prepare(
			`INSERT INTO login_attempts (ip, count, reset_at) VALUES (?, 1, ?)
			 ON CONFLICT(ip) DO UPDATE SET
			 count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
			 reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
			 WHERE reset_at <= ? OR count < ? RETURNING count`
		)
		.bind(ip, now + WINDOW_MS, now, now, now + WINDOW_MS, now, LIMIT)
		.first<number>('count');
	return count !== null;
}

export const actions: Actions = {
	default: async ({ request, cookies, platform, getClientAddress }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { error: '資料庫未配置' });

		const now = Date.now();
		// The adapter supplies the trusted client address; self-hosted callers cannot spoof it with a header.
		let ip = 'unknown';
		try {
			ip = getClientAddress();
		} catch {
			/* Share a conservative fallback limit when no address is available. */
		}
		const allowed = await checkAndBump(db, ip, now);
		if (!allowed) {
			return fail(429, { error: '嘗試次數過多，請 15 分鐘後再試' });
		}

		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!username || !password) {
			return fail(400, { error: '請輸入帳號與密碼' });
		}

		const kit = getDb(db);
		const rows = await kit.select().from(users).where(eq(users.username, username)).limit(1);
		const user = rows[0];

		if (!user || !(await verifyPassword(user.passwordHash, password))) {
			return fail(401, { error: '帳號或密碼錯誤' });
		}

		await kit.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
		await cleanupSessions(db).catch(() => {});
		const token = await createSession(db, user.id);
		cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
		redirect(303, '/admin');
	}
};
