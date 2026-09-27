import { eq, lt } from 'drizzle-orm';
import { getDb } from './db';
import { sessions, users } from './db/schema';
import type { D1Database } from '@cloudflare/workers-types';

// hashPassword / verifyPassword (WebCrypto PBKDF2)
export { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'kikigaki_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
	id: string;
	username: string;
	role: string;
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return toHex(new Uint8Array(digest));
}

// hashPassword / verifyPassword provided by './password' (WebCrypto PBKDF2) and re-exported

export function generateSessionToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return toHex(bytes);
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
	const kit = getDb(db);
	const token = generateSessionToken();
	await kit.insert(sessions).values({
		userId,
		tokenHash: await sha256Hex(token),
		expiresAt: new Date(Date.now() + SESSION_DURATION_MS)
	});
	return token;
}

/** verify a token; auto-clean expired ones. Returns the user or null */
export async function validateSession(
	db: D1Database,
	token: string | undefined
): Promise<SessionUser | null> {
	if (!token) return null;
	const kit = getDb(db);

	const rows = await kit
		.select({
			sessionId: sessions.id,
			expiresAt: sessions.expiresAt,
			userId: users.id,
			username: users.username,
			role: users.role
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.tokenHash, await sha256Hex(token)))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	if (row.expiresAt.getTime() < Date.now()) {
		await kit.delete(sessions).where(eq(sessions.id, row.sessionId));
		return null;
	}

	return { id: row.userId, username: row.username, role: row.role };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)));
}

/** periodic cleanup: delete all expired sessions */
export async function cleanupSessions(db: D1Database): Promise<void> {
	const kit = getDb(db);
	await kit.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function sessionCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax' as const,
		maxAge: SESSION_DURATION_MS / 1000
	};
}
