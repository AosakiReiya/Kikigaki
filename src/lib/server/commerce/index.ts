/**
 * Phase 79e-1 commerce core — orchestration (materialize order → provider redirect → webhook
 * settlement → delivery tokens). Prices/files always come from current DB values (clients only
 * pass typeKey+slug). Product contract (mirrored in skills/add-content-type): a products type needs
 *   price(text, "12.00") · file(media, private "goods/…" key) · title field of choice
 * currency from env COMMERCE_CURRENCY (default usd).
 */
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { deliveryTokens, orderItems, orders } from '../db/schema';
import { getItem, getType } from '../content-items';
import { getSettings } from '../settings';
import { emit } from '$lib/plugins/hooks';
import { createStripeProvider } from './stripe';
import { createPayPalProvider } from './paypal';
import { createAirwallexProvider } from './airwallex';
import { createMockProvider } from './mock';
import {
	parsePriceCents,
	type CheckoutLine,
	type CheckoutProvider,
	type CommerceEnv
} from './types';
import type { D1Database } from '@cloudflare/workers-types';

export type { CommerceEnv } from './types';

/**
 * Enabled provider list. PAYMENT_PROVIDER may be a comma list (e.g. "stripe,paypal");
 * unset = every provider with complete keys (stripe/paypal/airwallex; mock is never implied —
 * it needs PAYMENT_PROVIDER to include mock AND ALLOW_MOCK_PAYMENTS=1 — production double-gate).
 */
export function resolveProviders(env: CommerceEnv): CheckoutProvider[] {
	const build: Record<string, () => CheckoutProvider | null> = {
		stripe: () =>
			env.STRIPE_SECRET && env.STRIPE_WEBHOOK_SECRET
				? createStripeProvider(env.STRIPE_SECRET, env.STRIPE_WEBHOOK_SECRET)
				: null,
		paypal: () =>
			env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET
				? createPayPalProvider(
						env.PAYPAL_CLIENT_ID,
						env.PAYPAL_SECRET,
						env.PAYPAL_WEBHOOK_ID ?? '',
						env.PAYPAL_ENV === 'live'
					)
				: null,
		airwallex: () =>
			env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY && env.AIRWALLEX_WEBHOOK_SECRET
				? createAirwallexProvider(
						env.AIRWALLEX_CLIENT_ID,
						env.AIRWALLEX_API_KEY,
						env.AIRWALLEX_WEBHOOK_SECRET,
						env.AIRWALLEX_ENV === 'prod'
					)
				: null,
		mock: () => (env.ALLOW_MOCK_PAYMENTS === '1' ? createMockProvider() : null)
	};
	const want = (env.PAYMENT_PROVIDER ?? '')
		.split(',')
		.map((x) => x.trim().toLowerCase())
		.filter(Boolean);
	const names = want.length ? want : ['stripe', 'paypal', 'airwallex'];
	const out: CheckoutProvider[] = [];
	for (const n of names) {
		const p = build[n]?.();
		if (p && !out.some((o) => o.name === p.name)) out.push(p);
	}
	return out;
}

/** checkout 幣別解析：DB 設定 → env COMMERCE_CURRENCY → usd。 */
export async function resolveCurrency(db: D1Database, env: CommerceEnv): Promise<string> {
	try {
		const settings = await getSettings(db);
		if (settings.commerceCurrency) return settings.commerceCurrency;
	} catch {
		/* settings unreadable = fall through to env */
	}
	return (env.COMMERCE_CURRENCY ?? 'usd').toLowerCase();
}

export interface PricedItem {
	slug: string;
	title: string;
	summary: string;
	cover: string;
	price: string;
	priceCents: number | null;
	deliverable: boolean;
}

/** product view (for shop surfaces). Non-contract fields degrade to info rows automatically. */
export async function pricedItem(
	db: D1Database,
	typeKey: string,
	slug: string
): Promise<PricedItem | null> {
	const type = await getType(db, typeKey);
	if (!type) return null;
	const item = await getItem(db, typeKey, slug);
	if (!item || !item.published) return null;
	return shape(type.titleField, item.data, slug);
}

function shape(titleField: string, data: Record<string, unknown>, slug: string): PricedItem {
	const price = typeof data.price === 'string' ? data.price : '';
	const file = typeof data.file === 'string' ? data.file : '';
	return {
		slug,
		title: String(data[titleField] ?? slug),
		summary: String(data.summary ?? ''),
		cover: String(data.cover ?? ''),
		price,
		priceCents: parsePriceCents(price, 'usd'),
		deliverable: file.startsWith('goods/')
	};
	// NOTE: priceCents is display-only on shop surfaces; checkout always re-parses
	// against the resolved currency in stageOrder (single source of money).
}

/** stage one: validate the product contract → materialize a pending order (no provider bound yet). */
export async function stageOrder(
	db: D1Database,
	env: CommerceEnv,
	items: { typeKey: string; slug: string }[],
	email: string,
	clientIp?: string
): Promise<{ orderId: string } | { error: string }> {
	const uniq = [...new Map(items.map((i) => [`${i.typeKey}/${i.slug}`, i])).values()].slice(0, 20);
	if (uniq.length === 0) return { error: 'empty_cart' };
	const currency = await resolveCurrency(db, env);
	const lines: CheckoutLine[] = [];
	for (const it of uniq) {
		const type = await getType(db, it.typeKey);
		if (!type?.enabled) return { error: 'unknown_type' };
		const item = await getItem(db, it.typeKey, it.slug);
		if (!item || !item.published) return { error: 'item_unavailable' };
		const priceCents = parsePriceCents(item.data.price, currency);
		const fileKey = typeof item.data.file === 'string' ? item.data.file : '';
		if (priceCents === null) return { error: 'bad_price' };
		if (!fileKey.startsWith('goods/')) return { error: 'not_deliverable' };
		lines.push({
			typeKey: it.typeKey,
			slug: it.slug,
			title: String(item.data[type.titleField] ?? item.slug),
			priceCents,
			fileKey
		});
	}
	const totalCents = lines.reduce((a, l) => a + l.priceCents, 0);
	const orderId = crypto.randomUUID();
	const now = new Date();
	const kit = getDb(db);
	await kit
		.insert(orders)
		.values({
			id: orderId,
			email: email.slice(0, 200),
			status: 'pending',
			provider: '',
			clientIp: clientIp?.slice(0, 64) ?? null,
			currency,
			totalCents,
			createdAt: now,
			updatedAt: now
		})
		.run();
	await kit
		.insert(orderItems)
		.values(
			lines.map((l) => ({
				id: crypto.randomUUID(),
				orderId,
				typeKey: l.typeKey,
				slug: l.slug,
				title: l.title,
				priceCents: l.priceCents,
				fileKey: l.fileKey
			}))
		)
		.run();
	return { orderId };
}

/** stage two: attach a materialized order to a provider checkout (returns the redirect URL). */
export async function attachProvider(
	db: D1Database,
	provider: CheckoutProvider,
	orderId: string,
	origin: string
): Promise<{ redirectUrl: string } | { error: string }> {
	const kit = getDb(db);
	const order = await kit.select().from(orders).where(eq(orders.id, orderId)).get();
	if (!order) return { error: 'no_such_order' };
	if (order.status !== 'pending') return { error: `status_${order.status}` };
	if (order.providerSession) return { error: 'already_attached' };
	const rows = await kit.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
	const lines: CheckoutLine[] = rows.length
		? rows.map((r) => ({
				typeKey: r.typeKey,
				slug: r.slug,
				title: r.title,
				priceCents: r.priceCents,
				fileKey: r.fileKey
			}))
		: [
				{
					typeKey: 'tip',
					slug: orderId,
					title: 'Support',
					priceCents: order.totalCents,
					fileKey: ''
				}
			];
	try {
		const session = await provider.createSession(
			{ id: orderId, currency: order.currency },
			lines,
			origin
		);
		await kit
			.update(orders)
			.set({ provider: provider.name, providerSession: session.sessionRef, updatedAt: new Date() })
			.where(eq(orders.id, orderId))
			.run();
		return { redirectUrl: session.redirectUrl };
	} catch (e) {
		await kit
			.update(orders)
			.set({ status: 'failed', updatedAt: new Date() })
			.where(eq(orders.id, orderId))
			.run();
		return { error: `provider_error:${String((e as Error)?.message ?? e).slice(0, 48)}` };
	}
}

/** 79e-3 tip order: no items; the total IS the gesture (amount string follows the price contract "5.00"). */
export async function tipOrder(
	db: D1Database,
	env: CommerceEnv,
	amount: string,
	message: string,
	clientIp?: string
): Promise<{ orderId: string } | { error: string }> {
	const currency = await resolveCurrency(db, env);
	const cents = parsePriceCents(amount, currency);
	if (cents === null) return { error: 'bad_amount' };
	if (cents > 10_000_00) return { error: 'amount_too_big' };
	const orderId = crypto.randomUUID();
	const now = new Date();
	await getDb(db)
		.insert(orders)
		.values({
			id: orderId,
			email: '',
			status: 'pending',
			provider: '',
			clientIp: clientIp?.slice(0, 64) ?? null,
			kind: 'tip',
			message: message.slice(0, 500),
			currency,
			totalCents: cents,
			createdAt: now,
			updatedAt: now
		})
		.run();
	return { orderId };
}

/** find an order by providerSession or order id (webhook/thanks can match on either key). */
export async function findOrder(db: D1Database, ref: string) {
	const kit = getDb(db);
	const o = await kit.select().from(orders).where(eq(orders.providerSession, ref)).get();
	return o ?? (await kit.select().from(orders).where(eq(orders.id, ref)).get());
}

/** idempotent: pending→paid plus delivery-token issuance (90-day validity); duplicate webhooks succeed */
export async function markPaid(
	db: D1Database,
	sessionRef: string,
	email: string,
	providerRef?: string,
	opts?: { masterKey?: string }
): Promise<{ ok: boolean; error?: string }> {
	const kit = getDb(db);
	let order = await kit.select().from(orders).where(eq(orders.providerSession, sessionRef)).get();
	if (!order) order = await kit.select().from(orders).where(eq(orders.id, sessionRef)).get();
	if (!order) return { ok: false, error: 'no_such_order' };
	if (order.status === 'paid') return { ok: true };
	if (order.status !== 'pending') return { ok: false, error: `status_${order.status}` };
	const now = new Date();
	await kit
		.update(orders)
		.set({
			status: 'paid',
			email: email || order.email,
			providerRef: providerRef || order.providerRef,
			updatedAt: now
		})
		.where(eq(orders.id, order.id))
		.run();
	const items = await kit.select().from(orderItems).where(eq(orderItems.orderId, order.id)).all();
	for (const it of items) {
		const token = [...crypto.getRandomValues(new Uint8Array(24))]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		await kit
			.insert(deliveryTokens)
			.values({
				token,
				orderItemId: it.id,
				createdAt: now,
				expiresAt: new Date(now.getTime() + 90 * 86_400_000),
				downloads: 0
			})
			.onConflictDoNothing()
			.run();
	}
	void emit(
		'order:paid',
		{
			orderId: order.id,
			email: email || order.email,
			provider: order.provider,
			currency: order.currency,
			totalCents: order.totalCents,
			kind: (order.kind ?? 'goods') as 'goods' | 'tip',
			itemCount: items.length
		},
		{ db, masterKey: opts?.masterKey }
	).catch(() => {});
	if ((order.kind ?? 'goods') === 'tip')
		void emit(
			'support:received',
			{ orderId: order.id, amountCents: order.totalCents, message: order.message ?? '' },
			{ db }
		).catch(() => {});
	return { ok: true };
}

/** refund revocation: paid→refunded and all delivery tokens revoked immediately */
export async function markRefunded(
	db: D1Database,
	providerRefOrSession: string
): Promise<{ ok: boolean; error?: string }> {
	const kit = getDb(db);
	let order = await kit
		.select()
		.from(orders)
		.where(eq(orders.providerRef, providerRefOrSession))
		.get();
	if (!order)
		order = await kit
			.select()
			.from(orders)
			.where(eq(orders.providerSession, providerRefOrSession))
			.get();
	if (!order) return { ok: false, error: 'no_such_order' };
	if (order.status === 'refunded') return { ok: true };
	if (order.status !== 'paid') return { ok: false, error: `status_${order.status}` };
	const items = await kit
		.select({ id: orderItems.id })
		.from(orderItems)
		.where(eq(orderItems.orderId, order.id))
		.all();
	for (const it of items)
		await kit.delete(deliveryTokens).where(eq(deliveryTokens.orderItemId, it.id)).run();
	await kit
		.update(orders)
		.set({ status: 'refunded', updatedAt: new Date() })
		.where(eq(orders.id, order.id))
		.run();
	return { ok: true };
}

export async function deliveriesForSession(db: D1Database, sessionRef: string) {
	const kit = getDb(db);
	let order = await kit.select().from(orders).where(eq(orders.providerSession, sessionRef)).get();
	if (!order) order = await kit.select().from(orders).where(eq(orders.id, sessionRef)).get();
	if (!order)
		return { status: 'unknown', kind: '', items: [] as { title: string; token: string }[] };
	const rows = await kit
		.select({ title: orderItems.title, token: deliveryTokens.token })
		.from(orderItems)
		.innerJoin(deliveryTokens, eq(deliveryTokens.orderItemId, orderItems.id))
		.where(eq(orderItems.orderId, order.id))
		.all();
	return { status: order.status, kind: order.kind ?? 'goods', items: rows };
}

/** token = access: validate + atomically increment download count, return the file key */
export async function takeDelivery(
	db: D1Database,
	token: string
): Promise<{ fileKey: string; title: string } | null> {
	const kit = getDb(db);
	const row = await kit
		.select({
			fileKey: orderItems.fileKey,
			title: orderItems.title,
			exp: deliveryTokens.expiresAt,
			status: orders.status
		})
		.from(deliveryTokens)
		.innerJoin(orderItems, eq(orderItems.id, deliveryTokens.orderItemId))
		.innerJoin(orders, eq(orders.id, orderItems.orderId))
		.where(eq(deliveryTokens.token, token))
		.get();
	if (!row || row.status !== 'paid') return null;
	if (row.exp && (row.exp as unknown as Date).getTime() < Date.now()) return null;
	await kit
		.run(sql`UPDATE delivery_tokens SET downloads = downloads + 1 WHERE token = ${token}`)
		.catch(() => {});
	return { fileKey: row.fileKey, title: row.title };
}

/** 84 anti-abuse: ≤ RATE_WINDOW_ORDERS staged orders per IP per hour (no IP = uncounted). */
const RATE_WINDOW_MS = 3_600_000;
const RATE_WINDOW_ORDERS = 10;
export async function orderRateOk(db: D1Database, clientIp: string): Promise<boolean> {
	if (!clientIp) return true;
	const since = new Date(Date.now() - RATE_WINDOW_MS);
	const row = await getDb(db)
		.select({ c: sql<number>`COUNT(*)` })
		.from(orders)
		.where(sql`client_ip = ${clientIp.slice(0, 64)} AND created_at > ${since.getTime()}`)
		.get();
	return Number(row?.c ?? 0) < RATE_WINDOW_ORDERS;
}

/** 84: stale pending orders (>24h) are swept — provider sessions expire at 24h anyway. */
export async function sweepStaleOrders(db: D1Database): Promise<number> {
	const cutoff = Date.now() - 24 * 3_600_000;
	const res = await getDb(db)
		.run(sql`DELETE FROM orders WHERE status = 'pending' AND created_at < ${cutoff}`)
		.catch(() => null);
	return Number((res as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

export async function recentOrders(db: D1Database, limit = 50) {
	const kit = getDb(db);
	const os = await kit.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).all();
	if (os.length === 0) return [];
	const counts = await kit
		.select({ orderId: orderItems.orderId, c: sql<number>`COUNT(*)` })
		.from(orderItems)
		.groupBy(orderItems.orderId)
		.all();
	const byOrder = new Map(counts.map((c) => [c.orderId, Number(c.c)]));
	return os.map((o) => ({
		id: o.id,
		email: o.email,
		status: o.status,
		provider: o.provider,
		currency: o.currency,
		totalCents: o.totalCents,
		itemCount: byOrder.get(o.id) ?? 0,
		kind: o.kind ?? 'goods',
		message: o.message ?? '',
		createdAt: o.createdAt
	}));
}
