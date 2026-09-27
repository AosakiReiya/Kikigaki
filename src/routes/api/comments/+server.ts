import { dev } from '$app/environment';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { emit } from '$lib/plugins';
import { comments, posts, siteSettings } from '$lib/server/db/schema';
import { notifyCommentApproved } from '$lib/server/comment-notify';
import { effectiveThresholds, getModerationConfig } from '$lib/server/moderation/config';
import {
	calculateRiskScore,
	decide,
	getModerationSignals,
	verifyTurnstile
} from '$lib/server/moderation';
import type { ModerationSignals } from '$lib/server/moderation';
import type { RequestHandler } from './$types';

/* * GET /api/comments?slug=xxx — approved comments */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = platform?.env.DB;
	if (!db) return json([]);

	const slug = url.searchParams.get('slug') ?? '';
	if (!slug || slug.length > 200) return json([]);

	const kit = getDb(db);
	const rows = await kit
		.select({
			id: comments.id,
			name: comments.name,
			content: comments.content,
			parentId: comments.parentId,
			createdAt: comments.createdAt
		})
		.from(comments)
		.where(and(eq(comments.postId, `post:${slug}`), eq(comments.status, 'approved')))
		.orderBy(desc(comments.createdAt));

	return json(rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
};

const MAX_NAME = 50;
const MAX_CONTENT = 2000;
const RATE_WINDOW_MIN = 5;
const RATE_LIMIT = 3;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const DUP_WINDOW_MS = 24 * 60 * 60 * 1000;

async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/comments
 * Flow: Turnstile → validation → rate limit → feature extraction → Rule Engine → decide
 * Honeypot: hidden field filled = bot → silent 200 (nothing stored; bots aren't taught).
 */
export const POST: RequestHandler = async ({ request, platform }) => {
	const db = platform?.env.DB;
	if (!db) return new Response(null, { status: 503 });

	let body: {
		slug?: unknown;
		name?: unknown;
		email?: unknown;
		content?: unknown;
		website?: unknown;
		turnstileToken?: unknown;
		parentId?: unknown;
	};
	try {
		body = await request.json();
	} catch {
		return new Response(null, { status: 400 });
	}

	const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	const email = typeof body.email === 'string' ? body.email.trim().slice(0, 100) : '';
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	const rawParentId = typeof body.parentId === 'string' ? body.parentId.trim() : '';
	const turnstileToken = body.turnstileToken;

	if (!slug || slug.length > 200) {
		return json({ error: 'validation_slug', reason: 'validation_slug' }, { status: 400 });
	}
	if (!name || name.length > MAX_NAME) {
		return json({ error: 'validation_name', reason: 'validation_name' }, { status: 400 });
	}
	if (!content || content.length > MAX_CONTENT) {
		return json({ error: 'validation_content', reason: 'validation_content' }, { status: 400 });
	}
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ error: 'validation_email', reason: 'validation_email' }, { status: 400 });
	}

	// Honeypot: bots fill hidden fields → silent success but nothing stored
	const honeypot = typeof body.website === 'string' ? body.website.trim() : '';
	if (honeypot) {
		return json({ ok: true, status: 'spam', approved: false }, { status: 200 });
	}

	const kit = getDb(db);
	// test seam (same pattern as GSC): a DB key overrides the siteverify endpoint so e2e can run the approval flow
	const [seamRow] = await kit
		.select({ value: siteSettings.value })
		.from(siteSettings)
		.where(eq(siteSettings.key, 'turnstile_verify_url'))
		.limit(1);

	const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
	const userAgent = request.headers.get('user-agent') ?? '';

	// first layer: Cloudflare Turnstile (production missing the secret → fail closed 403)
	const turnstile = await verifyTurnstile(turnstileToken, ip, {
		secret: platform.env.TURNSTILE_SECRET,
		hostnames: platform.env.TURNSTILE_HOSTNAMES,
		// self-host (node) lacking Turnstile is normal — skip instead of failing closed when the secret is missing
		failClosed: !dev && process.env.SELF_HOST !== '1',
		verifyUrl: seamRow?.value
	});
	if (turnstile.status === 'failed') {
		console.error('[comments] turnstile failed:', turnstile.reason);
		return json({ error: 'turnstile_failed', reason: turnstile.reason }, { status: 403 });
	}
	const turnstileResult = turnstile.status; // 'passed' | 'skipped'

	// the post must exist
	const postRows = await kit
		.select({ id: posts.id })
		.from(posts)
		.where(eq(posts.id, `post:${slug}`))
		.limit(1);
	if (postRows.length === 0) {
		return json({ error: 'post_not_found', reason: 'post_not_found' }, { status: 404 });
	}

	// Phase 70: replies — parent must exist, same post, approved; replies to child comments auto-attach to the thread root (one level)
	let parentId: string | null = null;
	if (rawParentId) {
		const [parentRow] = await kit
			.select({
				id: comments.id,
				status: comments.status,
				postId: comments.postId,
				parentId: comments.parentId
			})
			.from(comments)
			.where(eq(comments.id, rawParentId))
			.limit(1);
		if (!parentRow || parentRow.postId !== `post:${slug}` || parentRow.status !== 'approved') {
			return json({ error: 'validation_parent', reason: 'validation_parent' }, { status: 400 });
		}
		parentId = parentRow.parentId ?? parentRow.id;
	}

	const ipHash = await sha256Hex(`kikigaki:${ip}`);
	const userAgentHash = await sha256Hex(`kikigaki:ua:${userAgent}`);

	// Rate limit: same IP max 3 per 5 minutes (separate from spam detection)
	const windowStart = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000);
	const [recent] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(comments)
		.where(and(gt(comments.createdAt, windowStart), eq(comments.ipHash, ipHash)));
	if ((recent?.count ?? 0) >= RATE_LIMIT) {
		return json({ error: 'rate_limited', reason: 'rate_limited' }, { status: 429 });
	}

	// Stats the Rule Engine needs: duplicate comments + burst counts
	const dupWindowStart = new Date(Date.now() - DUP_WINDOW_MS);
	const [dup] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(comments)
		.where(
			and(
				eq(comments.ipHash, ipHash),
				eq(comments.content, content),
				gt(comments.createdAt, dupWindowStart)
			)
		);
	const burstWindowStart = new Date(Date.now() - BURST_WINDOW_MS);
	const [burst] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(comments)
		.where(and(eq(comments.ipHash, ipHash), gt(comments.createdAt, burstWindowStart)));

	// Phase 74: moderation console — strength thresholds + owner banned words
	const modCfg = await getModerationConfig(db);
	const thresholds = effectiveThresholds(modCfg);
	const risk = calculateRiskScore({
		content,
		ipHash,
		userAgent,
		recentFromIp: burst?.count ?? 0,
		isDuplicate: (dup?.count ?? 0) > 0,
		bannedWords: modCfg.bannedWords,
		bannedWordScore: thresholds.bannedWordScore
	});

	// second layer: only the mid-risk band enters AI moderation (V1 has no model wired / provider down returns null)
	let moderation: ModerationSignals | null = null;
	if (risk.total >= thresholds.approvedBelow && risk.total < thresholds.spamByRule) {
		moderation = await getModerationSignals(content);
	}

	const status = decide(risk.total, moderation, {
		approvedBelow: thresholds.approvedBelow,
		spamByRule: thresholds.spamByRule,
		moderationSafeBelow: thresholds.moderationSafeBelow,
		bannedHit: risk.bannedHits.length > 0
	});
	const now = new Date();

	const [inserted] = await kit
		.insert(comments)
		.values({
			postId: `post:${slug}`,
			parentId,
			name,
			email: email || null,
			content,
			ipHash,
			userAgentHash,
			status,
			riskScore: risk.total,
			riskReasons: JSON.stringify(risk.riskReasons),
			moderationResult: moderation ? JSON.stringify(moderation) : null,
			urlCount: risk.urls,
			contentLength: risk.contentLength,
			turnstileResult,
			patternHits: risk.patternHits,
			patternSamples: risk.patternSamples.length ? JSON.stringify(risk.patternSamples) : null,
			moderatedAt: status === 'pending' ? null : now
		})
		.returning({ id: comments.id });

	// Phase 70/71: auto-approve → notify the parent commenter / top-level notifies the owner (best-effort)
	if (status === 'approved') {
		await notifyCommentApproved(db, platform.env.AI_SECRET, inserted?.id ?? '');
	}

	// event (Phase 21): plugins can subscribe to comment creation (activity beacons, notifications, etc.)
	await emit(
		'comment:created',
		{
			id: inserted?.id ?? '',
			postSlug: slug,
			name,
			content,
			status,
			approved: status === 'approved'
		},
		{ db }
	);

	return json({ ok: true, status, approved: status === 'approved' }, { status: 201 });
};
