/** 79e units: price contract, multi-provider list resolution (mock double-gate), webhook verification (stripe scheme + mock). */
import { describe, it, expect } from 'vitest';
import { parsePriceCents, moneyString } from './types';
import { resolveProviders } from './index';
import { createStripeProvider } from './stripe';
import { createMockProvider } from './mock';
import type { CommerceEnv } from './types';

const env = (o: Partial<CommerceEnv>) => o as CommerceEnv;
const hdr = (sig: string) => new Headers({ 'stripe-signature': sig });

describe('parsePriceCents（商品 price 欄契約）', () => {
	it('兩位小數 → 分', () => {
		expect(parsePriceCents('12.00', 'usd')).toBe(1200);
		expect(parsePriceCents(' 0.99 ', 'usd')).toBe(99);
	});
	it('整數＝元（小數段補 00）', () => {
		expect(parsePriceCents('12', 'usd')).toBe(1200);
	});
	it('零小數幣別（JPY/TWD）：整數即最小單位；兩位小數＝元×100 合併', () => {
		expect(parsePriceCents('950', 'jpy')).toBe(950);
		expect(parsePriceCents('950', 'twd')).toBe(950);
		expect(parsePriceCents('9.50', 'jpy')).toBe(950);
	});
	it('非法格式回 null（一位小數、負數、文字、超六碼、零）', () => {
		expect(parsePriceCents('9.5', 'usd')).toBeNull();
		expect(parsePriceCents('-3', 'usd')).toBeNull();
		expect(parsePriceCents('abc', 'usd')).toBeNull();
		expect(parsePriceCents('1234567', 'usd')).toBeNull();
		expect(parsePriceCents('0.00', 'usd')).toBeNull();
		expect(parsePriceCents(12, 'usd')).toBeNull();
	});
});

describe('moneyString（帳場金額字串）', () => {
	it('一般幣別換算回元；零小數幣別直接用分', () => {
		expect(moneyString(1250, 'usd')).toBe('12.50');
		expect(moneyString(950, 'jpy')).toBe('950');
		expect(moneyString(300, 'TWD')).toBe('300');
	});
});

describe('resolveProviders（多金流清單＋mock 雙重閘門）', () => {
	const names = (e: CommerceEnv) => resolveProviders(e).map((p) => p.name);
	it('mock 需 PAYMENT_PROVIDER 含 mock ＋ ALLOW_MOCK_PAYMENTS=1 同時開啟', () => {
		expect(names(env({ PAYMENT_PROVIDER: 'mock' }))).toEqual([]);
		expect(names(env({ PAYMENT_PROVIDER: 'mock', ALLOW_MOCK_PAYMENTS: '1' }))).toEqual(['mock']);
	});
	it('各家需自家金鑰齊備', () => {
		expect(names(env({ STRIPE_SECRET: 'sk_t' }))).toEqual([]);
		expect(names(env({ STRIPE_SECRET: 'sk_t', STRIPE_WEBHOOK_SECRET: 'whsec_t' }))).toEqual([
			'stripe'
		]);
		expect(names(env({ PAYPAL_CLIENT_ID: 'cid', PAYPAL_SECRET: 'sec' }))).toEqual(['paypal']);
		expect(names(env({ AIRWALLEX_CLIENT_ID: 'c', AIRWALLEX_API_KEY: 'k' }))).toEqual([]);
		expect(
			names(
				env({ AIRWALLEX_CLIENT_ID: 'c', AIRWALLEX_API_KEY: 'k', AIRWALLEX_WEBHOOK_SECRET: 'wh' })
			)
		).toEqual(['airwallex']);
	});
	it('逗號清單排序如指定；未設＝全部已配置（隱含不含 mock）', () => {
		expect(
			names(
				env({
					STRIPE_SECRET: 's',
					STRIPE_WEBHOOK_SECRET: 'w',
					PAYPAL_CLIENT_ID: 'c',
					PAYPAL_SECRET: 'p',
					PAYMENT_PROVIDER: 'paypal,stripe'
				})
			)
		).toEqual(['paypal', 'stripe']);
		expect(
			names(
				env({
					STRIPE_SECRET: 's',
					STRIPE_WEBHOOK_SECRET: 'w',
					PAYPAL_CLIENT_ID: 'c',
					PAYPAL_SECRET: 'p'
				})
			)
		).toEqual(['stripe', 'paypal']);
		expect(
			names(
				env({
					PAYMENT_PROVIDER: 'mock,stripe',
					ALLOW_MOCK_PAYMENTS: '1',
					STRIPE_SECRET: 's',
					STRIPE_WEBHOOK_SECRET: 'w'
				})
			)
		).toEqual(['mock', 'stripe']);
	});
	it('指定清單裡未配置金鑰的 provider 自動剔除', () => {
		expect(
			names(env({ PAYMENT_PROVIDER: 'stripe,paypal', PAYPAL_CLIENT_ID: 'c', PAYPAL_SECRET: 'p' }))
		).toEqual(['paypal']);
	});
	it('無任何配置 → 空（站未開商店）', () => {
		expect(resolveProviders(env({}))).toEqual([]);
	});
});

describe('mock provider', () => {
	it('createSession 導向站內 thanks（帶 session_id）', async () => {
		const s = await createMockProvider().createSession(
			{ id: 'o1', currency: 'usd' },
			[],
			'https://x.test'
		);
		expect(s.sessionRef).toBe('mock_o1');
		expect(s.redirectUrl).toBe('https://x.test/checkout/thanks?session_id=mock_o1');
	});
	it('verifyWebhook 吃 session_id；非法輸入回 null', async () => {
		const w = createMockProvider().verifyWebhook;
		expect(await w('{"session_id":"mock_o1","email":"a@b.c"}', new Headers())).toEqual({
			handled: true,
			sessionRef: 'mock_o1',
			email: 'a@b.c'
		});
		expect(await w('not json', new Headers())).toBeNull();
		expect(await w('{}', new Headers())).toBeNull();
	});
});

describe('stripe webhook 驗簽（官方 t=,v1= scheme，零 SDK）', () => {
	const secret = 'whsec_test_key';
	async function sign(t: string, body: string): Promise<string> {
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`));
		return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	const body = JSON.stringify({
		type: 'checkout.session.completed',
		data: { object: { id: 'cs_1', customer_details: { email: 'a@b.c' } } }
	});

	it('合法簽章 → 成交事件解析', async () => {
		const t = String(Math.floor(Date.now() / 1000));
		const out = await createStripeProvider('sk_t', secret).verifyWebhook(
			body,
			hdr(`t=${t},v1=${await sign(t, body)}`)
		);
		expect(out).toEqual({ handled: true, sessionRef: 'cs_1', providerRef: '', email: 'a@b.c' });
	});
	it('偽造簽章／缺頭／過期時間戳 → null', async () => {
		const p = createStripeProvider('sk_t', secret);
		const t = String(Math.floor(Date.now() / 1000));
		expect(await p.verifyWebhook(body, hdr(`t=${t},v1=${'0'.repeat(64)}`))).toBeNull();
		expect(await p.verifyWebhook(body, new Headers())).toBeNull();
		const old = String(Math.floor(Date.now() / 1000) - 6 * 60);
		expect(await p.verifyWebhook(body, hdr(`t=${old},v1=${await sign(old, body)}`))).toBeNull();
	});
	it('charge.refunded → refunded 事件（含 payment_intent 反查鍵）', async () => {
		const t = String(Math.floor(Date.now() / 1000));
		const body2 = JSON.stringify({
			type: 'charge.refunded',
			data: { object: { payment_intent: 'pi_9' } }
		});
		expect(
			await createStripeProvider('sk_t', secret).verifyWebhook(
				body2,
				hdr(`t=${t},v1=${await sign(t, body2)}`)
			)
		).toEqual({
			handled: true,
			event: 'refunded',
			sessionRef: 'pi_9'
		});
	});
	it('非成交事件（如 ping）→ handled:false（靜默 200）', async () => {
		const t = String(Math.floor(Date.now() / 1000));
		const ping = JSON.stringify({ type: 'stripe.test' });
		expect(
			await createStripeProvider('sk_t', secret).verifyWebhook(
				ping,
				hdr(`t=${t},v1=${await sign(t, ping)}`)
			)
		).toEqual({ handled: false });
	});
});
