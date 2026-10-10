import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';
import { d1Adapter } from './testing/d1';
import { actions as setup } from '../../routes/admin/setup/+page.server';
import { GET as comments, POST as comment } from '../../routes/api/comments/+server';

const passwords = vi.hoisted(() => ({ hashPassword: vi.fn() }));
vi.mock('$lib/server/password', () => passwords);
vi.mock('$lib/plugins', () => ({ emit: vi.fn() }));
vi.mock('$lib/server/moderation', async (original) => ({
	...(await original<object>()),
	verifyTurnstile: vi.fn().mockResolvedValue({ status: 'passed' })
}));
let sqlite: DatabaseSync;
let db: D1Database;

beforeEach(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations')
		.filter((file) => file.endsWith('.sql'))
		.sort()) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	db = d1Adapter(sqlite);
	passwords.hashPassword.mockReset();
});
afterEach(() => sqlite.close());

describe('first-run ownership', () => {
	it('allows only one account when two initial setup requests pass the early check together', async () => {
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		let arrivals = 0;
		passwords.hashPassword.mockImplementation(async () => {
			if (++arrivals === 2) release();
			await ready;
			return 'test-hash';
		});
		const requests = ['owner1', 'owner2'].map((username) => {
			const data = new FormData();
			data.set('username', username);
			data.set('password', 'long-password');
			data.set('confirm', 'long-password');
			return setup.default({
				request: new Request('https://example.com/admin/setup', { method: 'POST', body: data }),
				platform: { env: { DB: db } },
				cookies: { set: vi.fn() }
			} as unknown as Parameters<typeof setup.default>[0]);
		});
		const results = await Promise.allSettled(requests);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		expect(results.find((result) => result.status === 'fulfilled')).toMatchObject({
			value: { status: 403 }
		});
		expect(sqlite.prepare('SELECT count(*) AS count FROM users').get()?.count).toBe(1);
		expect(sqlite.prepare('SELECT count(*) AS count FROM sessions').get()?.count).toBe(1);
	});
});

describe('public comments', () => {
	it('returns approved comments only for published articles and handles UUID post IDs', async () => {
		for (const published of [0, 1]) {
			const id = `uuid-${published}`;
			sqlite
				.prepare('INSERT INTO posts (id,slug,published,created_at,updated_at) VALUES (?,?,?,1,1)')
				.run(id, `post-${published}`, published);
			sqlite
				.prepare(
					"INSERT INTO comments (id,post_id,name,content,status,created_at) VALUES (?,?,'reader','approved text','approved',1)"
				)
				.run(`comment-${published}`, id);
			const response = await comments({
				url: new URL(`https://example.com/api/comments?slug=post-${published}`),
				platform: { env: { DB: db } }
			} as unknown as Parameters<typeof comments>[0]);
			expect((await response.json()).length).toBe(published);
		}
	});
	it('does not accept comments on drafts even with valid verification', async () => {
		sqlite
			.prepare('INSERT INTO posts (id,slug,published,created_at,updated_at) VALUES (?,?,0,1,1)')
			.run('draft-uuid', 'draft');
		const response = await comment({
			request: new Request('https://example.com/api/comments', {
				method: 'POST',
				body: JSON.stringify({ slug: 'draft', name: 'reader', content: 'hello' })
			}),
			platform: { env: { DB: db } }
		} as unknown as Parameters<typeof comment>[0]);
		expect(response.status).toBe(404);
		expect(sqlite.prepare('SELECT count(*) AS count FROM comments').get()?.count).toBe(0);
	});
});
