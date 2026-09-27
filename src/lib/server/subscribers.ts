/**
 * Phase 72 — newsletter subscription (double opt-in) + batch sending
 * Flow: subscribe checkbox → subscribers(pending, token) → send verify_email confirmation →
 * click link confirm → active. The token doubles as the unsubscribe credential (every email carries unsubscribeUrl).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { subscribers } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';
import { sendTemplatedEmail } from '$lib/server/email-templates';
import { site } from '$lib/site';

export type SubscriberStatus = 'pending' | 'active' | 'unsubscribed';

export interface SubscriberRow {
	id: string;
	email: string;
	name: string | null;
	status: SubscriberStatus;
	source: string;
	locale: string | null;
	createdAt: number;
	confirmedAt: number | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function newToken(): string {
	const b = crypto.getRandomValues(new Uint8Array(24));
	return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** subscribe request (comment-form checkbox / admin manual): new address → pending + confirmation email; already active → idempotent ok; unsubscribed → pending again */
export async function subscribe(
	db: D1Database,
	masterKey: string | undefined,
	input: { email: string; name?: string; source?: string; locale?: string }
): Promise<{ ok: boolean; status?: SubscriberStatus; error?: string }> {
	const email = input.email.trim().toLowerCase();
	if (!EMAIL_RE.test(email)) return { ok: false, error: 'email_invalid' };
	const kit = getDb(db);
	const [existing] = await kit
		.select()
		.from(subscribers)
		.where(eq(subscribers.email, email))
		.limit(1);
	if (existing?.status === 'active') return { ok: true, status: 'active' };
	const now = new Date();
	const token = existing?.token ?? newToken();
	if (existing) {
		await kit
			.update(subscribers)
			.set({
				status: 'pending',
				token,
				name: input.name?.trim() || existing.name,
				source: input.source ?? existing.source,
				locale: input.locale ?? existing.locale,
				createdAt: now,
				unsubscribedAt: null
			})
			.where(eq(subscribers.id, existing.id));
	} else {
		await kit.insert(subscribers).values({
			email,
			name: input.name?.trim() || null,
			status: 'pending',
			token,
			source: input.source ?? 'comment_form',
			locale: input.locale ?? null,
			createdAt: now
		});
	}
	// confirmation email (double opt-in; verify_email template)
	const r = await sendTemplatedEmail(db, masterKey, {
		to: email,
		type: 'verify_email',
		vars: {
			'user.name': input.name?.trim() || email,
			'user.email': email,
			'user.verifyUrl': `${site.url}/subscribe/confirm?t=${token}`
		}
	});
	if (!r.ok) return { ok: false, status: 'pending', error: r.error };
	return { ok: true, status: 'pending' };
}

export async function confirmSubscription(
	db: D1Database,
	token: string
): Promise<{ ok: boolean; email?: string; error?: string }> {
	const kit = getDb(db);
	const [row] = await kit.select().from(subscribers).where(eq(subscribers.token, token)).limit(1);
	if (!row) return { ok: false, error: 'not_found' };
	if (row.status === 'unsubscribed') return { ok: false, error: 'unsubscribed' };
	if (row.status !== 'active') {
		await kit
			.update(subscribers)
			.set({ status: 'active', confirmedAt: new Date() })
			.where(eq(subscribers.id, row.id));
	}
	return { ok: true, email: row.email };
}

export async function unsubscribe(
	db: D1Database,
	token: string
): Promise<{ ok: boolean; email?: string; error?: string }> {
	const kit = getDb(db);
	const [row] = await kit.select().from(subscribers).where(eq(subscribers.token, token)).limit(1);
	if (!row) return { ok: false, error: 'not_found' };
	if (row.status !== 'unsubscribed') {
		await kit
			.update(subscribers)
			.set({ status: 'unsubscribed', unsubscribedAt: new Date() })
			.where(eq(subscribers.id, row.id));
	}
	return { ok: true, email: row.email };
}

export async function listSubscribers(
	db: D1Database,
	opts?: { status?: SubscriberStatus; limit?: number }
): Promise<SubscriberRow[]> {
	const kit = getDb(db);
	const q = kit
		.select()
		.from(subscribers)
		.orderBy(desc(subscribers.createdAt))
		.limit(Math.min(500, opts?.limit ?? 200));
	const rows = opts?.status ? await q.where(eq(subscribers.status, opts.status)) : await q;
	return rows.map((r) => ({
		id: r.id,
		email: r.email,
		name: r.name,
		status: r.status,
		source: r.source,
		locale: r.locale,
		createdAt: r.createdAt?.getTime?.() ?? 0,
		confirmedAt: r.confirmedAt?.getTime?.() ?? null
	}));
}

export async function countSubscribers(db: D1Database): Promise<Record<SubscriberStatus, number>> {
	const kit = getDb(db);
	const rows = await kit.select().from(subscribers);
	const out: Record<SubscriberStatus, number> = { pending: 0, active: 0, unsubscribed: 0 };
	for (const r of rows) out[r.status]++;
	return out;
}

export async function removeSubscriber(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(subscribers).where(eq(subscribers.id, id));
}

/**
 * Send one post to all active subscribers (newsletter template; every email carries an unsubscribe link).
 * The batchSize cap prevents accidental mass sends (free providers cap around 100/day).
 */
export async function sendNewsletter(
	db: D1Database,
	masterKey: string | undefined,
	opts: { postSlug: string; limit?: number }
): Promise<{ sent: number; failed: number; errors: string[] }> {
	const kit = getDb(db);
	// post and title (base locale)
	const { posts, postTranslations } = await import('$lib/server/db/schema');
	const [post] = await kit
		.select({
			slug: posts.slug,
			title: postTranslations.title,
			summary: postTranslations.summary,
			publishedAt: posts.publishedAt,
			published: posts.published
		})
		.from(posts)
		.leftJoin(
			postTranslations,
			and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, 'zh-tw'))
		)
		.where(eq(posts.slug, opts.postSlug))
		.limit(1);
	if (!post) return { sent: 0, failed: 0, errors: ['找不到文章'] };
	if (!post.published) return { sent: 0, failed: 0, errors: ['文章尚未發布'] };
	const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
	const subs = await kit
		.select()
		.from(subscribers)
		.where(eq(subscribers.status, 'active'))
		.orderBy(subscribers.createdAt)
		.limit(limit);
	if (subs.length === 0) return { sent: 0, failed: 0, errors: ['尚無生效訂閱者'] };
	let sent = 0;
	let failed = 0;
	const errors: string[] = [];
	const url = `${site.url}/blog/${post.slug}`;
	for (const s of subs) {
		const r = await sendTemplatedEmail(db, masterKey, {
			to: s.email,
			type: 'newsletter',
			locale: s.locale ?? undefined,
			vars: {
				'user.name': s.name ?? s.email,
				'user.email': s.email,
				'user.unsubscribeUrl': `${site.url}/subscribe/unsubscribe?t=${s.token}`,
				'post.title': post.title ?? post.slug,
				'post.url': url,
				'post.summary': post.summary ?? '',
				'post.date': (post.publishedAt ?? new Date()).toISOString().slice(0, 10)
			}
		});
		if (r.ok) sent++;
		else {
			failed++;
			if (errors.length < 5) errors.push(`${s.email}: ${r.error}`);
		}
	}
	return { sent, failed, errors };
}
