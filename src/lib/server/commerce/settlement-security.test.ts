import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';
import type { CheckoutProvider } from './types';
import { d1Adapter } from '../testing/d1';
import { attachProvider, markPaid, markRefunded, takeDelivery } from './index';

const plugins = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/plugins/hooks', async (original) => ({ ...(await original<object>()), ...plugins }));
let sqlite: DatabaseSync;
let db: D1Database;
beforeEach(() => {
	sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations')
		.filter((name) => name.endsWith('.sql'))
		.sort()) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	db = d1Adapter(sqlite);
	sqlite.exec(
		"INSERT INTO orders (id,provider_session,provider_ref,status,created_at,updated_at) VALUES ('order','checkout','payment','pending',1,1); INSERT INTO order_items (id,order_id,type_key,slug,title,price_cents,file_key) VALUES ('item','order','goods','book','Book',100,'goods/book.pdf')"
	);
	plugins.emit.mockClear();
});
afterEach(() => sqlite.close());
const status = () => sqlite.prepare('SELECT status FROM orders').get()?.status;
const tokens = () => sqlite.prepare('SELECT token FROM delivery_tokens').all();
describe('transactional settlement and revocation', () => {
	it('issues one delivery and one event for concurrent duplicate settlement callbacks', async () => {
		const results = await Promise.all(
			Array.from({ length: 10 }, () => markPaid(db, 'checkout', 'buyer@example.com'))
		);
		expect(results.every((result) => result.ok)).toBe(true);
		expect(status()).toBe('paid');
		expect(tokens()).toHaveLength(1);
		expect(plugins.emit).toHaveBeenCalledTimes(1);
	});
	it('repairs a legacy paid order without a delivery without issuing another event', async () => {
		sqlite.exec("UPDATE orders SET status='paid' WHERE id='order'");
		expect(await markPaid(db, 'checkout', '')).toEqual({ ok: true });
		expect(tokens()).toHaveLength(1);
		expect(plugins.emit).not.toHaveBeenCalled();
	});
	it('makes only one external checkout when provider selection requests race', async () => {
		const createSession = vi.fn().mockResolvedValue({
			sessionRef: 'external-session',
			redirectUrl: 'https://example.com/pay'
		});
		const provider = { name: 'stripe', createSession } as unknown as CheckoutProvider;
		sqlite.exec("UPDATE orders SET provider_session=NULL WHERE id='order'");
		const results = await Promise.all(
			Array.from({ length: 10 }, () => attachProvider(db, provider, 'order', 'https://example.com'))
		);
		expect(createSession).toHaveBeenCalledTimes(1);
		expect(results.filter((result) => 'redirectUrl' in result)).toHaveLength(1);
		expect(results.filter((result) => 'error' in result)).toHaveLength(9);
	});
	it('does not mark a settled order failed when a delayed provider error arrives', async () => {
		const provider = {
			name: 'stripe',
			createSession: async () => {
				await markPaid(db, 'order', '');
				throw new Error('synthetic delayed provider error');
			}
		} as unknown as CheckoutProvider;
		sqlite.exec("UPDATE orders SET provider_session=NULL WHERE id='order'");
		expect(await attachProvider(db, provider, 'order', 'https://example.com')).toHaveProperty(
			'error'
		);
		expect(status()).toBe('paid');
		expect(tokens()).toHaveLength(1);
	});
	it('rolls back settlement if delivery issuance fails, permitting a safe retry', async () => {
		sqlite.exec(
			"CREATE TRIGGER fail_delivery BEFORE INSERT ON delivery_tokens BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
		);
		await expect(markPaid(db, 'checkout', '')).rejects.toThrow('synthetic failure');
		expect(status()).toBe('pending');
		expect(tokens()).toHaveLength(0);
		expect(plugins.emit).not.toHaveBeenCalled();
		sqlite.exec('DROP TRIGGER fail_delivery');
		expect(await markPaid(db, 'checkout', '')).toEqual({ ok: true });
		expect(tokens()).toHaveLength(1);
	});
	it('revokes paid deliveries and rejects settlement retries after refund', async () => {
		await markPaid(db, 'checkout', '');
		const token = String(tokens()[0].token);
		expect(await takeDelivery(db, token)).toMatchObject({ fileKey: 'goods/book.pdf' });
		expect(await markRefunded(db, 'payment')).toEqual({ ok: true });
		expect(status()).toBe('refunded');
		expect(tokens()).toHaveLength(0);
		expect(await takeDelivery(db, token)).toBeNull();
		expect(await markPaid(db, 'checkout', '')).toEqual({ ok: false, error: 'status_refunded' });
	});
	it('does not overwrite a refund that arrives between the initial read and settlement batch', async () => {
		const batch = db.batch.bind(db);
		db.batch = async (statements) => {
			sqlite.exec("UPDATE orders SET status='refunded' WHERE id='order'");
			return batch(statements);
		};
		expect(await markPaid(db, 'checkout', '')).toEqual({ ok: false, error: 'status_refunded' });
		expect(status()).toBe('refunded');
		expect(tokens()).toHaveLength(0);
		expect(plugins.emit).not.toHaveBeenCalled();
	});
	it('rolls back both refund and revocation if token deletion fails', async () => {
		await markPaid(db, 'checkout', '');
		sqlite.exec(
			"CREATE TRIGGER fail_revoke BEFORE DELETE ON delivery_tokens BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END"
		);
		await expect(markRefunded(db, 'payment')).rejects.toThrow('synthetic failure');
		expect(status()).toBe('paid');
		expect(tokens()).toHaveLength(1);
		sqlite.exec('DROP TRIGGER fail_revoke');
		expect(await markRefunded(db, 'payment')).toEqual({ ok: true });
		expect(tokens()).toHaveLength(0);
	});
});
