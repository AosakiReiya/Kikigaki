import { describe, expect, it } from 'vitest';
import { verifyTurnstile } from './turnstile';

describe('verifyTurnstile — fail-open/fail-closed 與輸入校驗', () => {
	it('skips when no secret and not failClosed（開發環境）', async () => {
		expect(await verifyTurnstile('token', '1.2.3.4', { secret: undefined })).toEqual({
			status: 'skipped'
		});
	});

	it('fails closed when no secret and failClosed（production 設定錯誤）', async () => {
		const r = await verifyTurnstile('token', '1.2.3.4', { secret: undefined, failClosed: true });
		expect(r.status).toBe('failed');
	});

	it('fails on empty / missing token when secret present', async () => {
		expect((await verifyTurnstile('', '1.2.3.4', { secret: 's' })).status).toBe('failed');
		expect((await verifyTurnstile(undefined, '1.2.3.4', { secret: 's' })).status).toBe('failed');
	});

	it('fails on non-string token', async () => {
		expect((await verifyTurnstile(123, '1.2.3.4', { secret: 's' })).status).toBe('failed');
	});
});
