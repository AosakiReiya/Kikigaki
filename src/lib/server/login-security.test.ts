import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';
import { d1Adapter } from './testing/d1';
import { actions } from '../../routes/admin/login/+page.server';

const password = vi.hoisted(() => ({
	verifyPassword: vi.fn().mockResolvedValue(false),
	hashPassword: vi.fn()
}));
vi.mock('$lib/server/password', () => password);
let sqlite: DatabaseSync;
let db: D1Database;
let now: number;
beforeEach(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations')
		.filter((name) => name.endsWith('.sql'))
		.sort()) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	db = d1Adapter(sqlite);
	sqlite
		.prepare(
			"INSERT INTO users (id,username,password_hash,role,created_at) VALUES ('owner','owner','test-hash','admin',1)"
		)
		.run();
	password.verifyPassword.mockClear();
	now = 1_000_000;
	vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
	sqlite.close();
	vi.restoreAllMocks();
});
function login(ip = '192.0.2.1', headerIp = ip) {
	const data = new FormData();
	data.set('username', 'owner');
	data.set('password', 'wrong-password');
	return actions.default({
		request: new Request('https://example.com/admin/login', {
			method: 'POST',
			headers: { 'cf-connecting-ip': headerIp },
			body: data
		}),
		getClientAddress: () => ip,
		platform: { env: { DB: db } },
		cookies: { set: vi.fn() }
	} as unknown as Parameters<typeof actions.default>[0]);
}
describe('atomic login throttling', () => {
	it('allows at most five password checks during a concurrent burst', async () => {
		const results = await Promise.all(Array.from({ length: 20 }, () => login()));
		expect(results.filter((result) => result?.status === 401)).toHaveLength(5);
		expect(results.filter((result) => result?.status === 429)).toHaveLength(15);
		expect(password.verifyPassword).toHaveBeenCalledTimes(5);
		expect(sqlite.prepare('SELECT count FROM login_attempts').get()?.count).toBe(5);
	});
	it('keeps a fixed fifteen-minute window and resets at its expiry', async () => {
		for (let index = 0; index < 5; index++) {
			await login();
			now += 1_000;
		}
		expect((await login())?.status).toBe(429);
		expect(sqlite.prepare('SELECT reset_at FROM login_attempts').get()?.reset_at).toBe(1_900_000);
		now = 1_900_000;
		expect((await login())?.status).toBe(401);
		expect(sqlite.prepare('SELECT count FROM login_attempts').get()?.count).toBe(1);
	});
	it('ignores spoofed client-IP headers when the adapter address stays the same', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, index) => login('192.0.2.1', `192.0.2.${index + 10}`))
		);
		expect(results.filter((result) => result?.status === 401)).toHaveLength(5);
		expect(results.filter((result) => result?.status === 429)).toHaveLength(5);
	});
	it('counts different trusted edge IPs independently', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, (_, index) => login(index % 2 ? '192.0.2.1' : '192.0.2.2'))
		);
		expect(results.every((result) => result?.status === 401)).toBe(true);
		expect(password.verifyPassword).toHaveBeenCalledTimes(10);
	});
});
