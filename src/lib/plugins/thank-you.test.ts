/** P83 hooks-consumer unit: thank-you plugin gating + payload mapping. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/email-templates', () => ({ sendTemplatedEmail: sendMock }));

import { thankYouPlugin } from './builtin/thank-you';

const handler = thankYouPlugin.hooks.on!['order:paid']!;
const base = {
	orderId: 'o1',
	email: 'buyer@x.test',
	provider: 'mock',
	currency: 'usd',
	totalCents: 1250,
	kind: 'goods' as const,
	itemCount: 2
};

describe('builtin-thank-you', () => {
	beforeEach(() => {
		sendMock.mockClear();
		sendMock.mockResolvedValue({ ok: true, subject: 'x' });
	});

	it('skips silently without db / masterKey / email', async () => {
		await handler(base, {});
		await handler(base, { db: {} as never });
		await handler({ ...base, email: '' }, { db: {} as never, masterKey: 'k' });
		expect(sendMock).not.toHaveBeenCalled();
	});
	it('sends purchase_thanks with formatted vars when fully equipped', async () => {
		await handler(base, { db: {} as never, masterKey: 'k' });
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [db, key, opts] = sendMock.mock.calls[0] as unknown as [
			unknown,
			string,
			Record<string, Record<string, string> | string>
		];
		expect(key).toBe('k');
		expect(opts.to).toBe('buyer@x.test');
		expect(opts.type).toBe('purchase_thanks');
		const vars = opts.vars as Record<string, string>;
		expect(vars['order.total']).toBe('USD 12.50');
		expect(vars['order.itemCount']).toBe('2');
		expect(vars['order.url']).toContain('session_id=o1');
		void db;
	});
	it('zero-decimal currency renders integer total', async () => {
		await handler(
			{ ...base, currency: 'jpy', totalCents: 950 },
			{ db: {} as never, masterKey: 'k' }
		);
		const vars = ((sendMock.mock.calls[0] as unknown[])[2] as { vars: Record<string, string> })
			.vars;
		expect(vars['order.total']).toBe('JPY 950');
	});
	it('send failure never throws out of the handler', async () => {
		sendMock.mockResolvedValueOnce({ ok: false, error: 'no template' });
		await expect(handler(base, { db: {} as never, masterKey: 'k' })).resolves.toBeUndefined();
	});
});
