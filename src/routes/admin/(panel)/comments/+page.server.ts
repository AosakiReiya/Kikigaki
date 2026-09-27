import { desc, eq, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { comments } from '$lib/server/db/schema';
import { notifyCommentApproved } from '$lib/server/comment-notify';
import type { Actions, PageServerLoad } from './$types';

const STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const;
type Status = (typeof STATUSES)[number];

export const load: PageServerLoad = async ({ platform, url }) => {
	const status = (url.searchParams.get('status') ?? 'pending') as Status;
	const safeStatus = STATUSES.includes(status) ? status : 'pending';

	const db = platform?.env.DB;
	if (!db) {
		return {
			dbReady: false as const,
			status: safeStatus,
			comments: [],
			counts: {} as Partial<Record<Status, number>>
		};
	}

	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(comments)
		.where(eq(comments.status, safeStatus))
		.orderBy(desc(comments.createdAt));
	// Phase 70: reply context — parent-commenter name map (for the list's ↩ badge)
	const parentRows = await kit
		.select({ id: comments.id, name: comments.name })
		.from(comments)
		.where(sql`id IN (SELECT DISTINCT parent_id FROM comments WHERE parent_id IS NOT NULL)`);
	const repliedMap = new Map(parentRows.map((x) => [x.id, x.name]));
	const rowsWithContext = rows.map((r) => ({
		...r,
		repliedTo: r.parentId ? (repliedMap.get(r.parentId) ?? null) : null
	}));

	const countRows = await kit
		.select({ status: comments.status, count: sql<number>`count(*)` })
		.from(comments)
		.groupBy(comments.status);
	const counts = Object.fromEntries(countRows.map((r) => [r.status, r.count]));

	return {
		dbReady: true as const,
		status: safeStatus,
		counts: counts as Partial<Record<Status, number>>,
		comments: rowsWithContext.map((c) => ({ ...c, slug: c.postId.replace(/^post:/, '') }))
	};
};

async function setStatus(request: Request, platform: App.Platform | undefined, status: Status) {
	const db = platform?.env.DB;
	if (!db) return fail(500, { error: '資料庫未配置' });

	const data = await request.formData();
	const id = String(data.get('id') ?? '');
	if (!id) return fail(400, { error: '缺少 comment id' });

	const kit = getDb(db);
	await kit.update(comments).set({ status, moderatedAt: new Date() }).where(eq(comments.id, id));
	// Phase 70/71: approve → reply notification / owner notification (best-effort; the helper self-checks conditions)
	if (status === 'approved') await notifyCommentApproved(db, platform?.env.AI_SECRET, id);
}

export const actions: Actions = {
	approve: ({ request, platform }) => setStatus(request, platform, 'approved'),
	spam: ({ request, platform }) => setStatus(request, platform, 'spam'),
	reject: ({ request, platform }) => setStatus(request, platform, 'rejected'),
	pending: ({ request, platform }) => setStatus(request, platform, 'pending'),
	bulk: async ({ request, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { error: '資料庫未配置' });
		const data = await request.formData();
		const op = String(data.get('op') ?? '');
		const ids = data.getAll('ids').map(String).filter(Boolean).slice(0, 100);
		if (!ids.length) return fail(400, { error: '未選擇評論' });
		if (!['approve', 'spam', 'reject', 'pending', 'delete'].includes(op))
			return fail(400, { error: '未知操作' });
		const kit = getDb(db);
		const now = new Date();
		for (const id of ids) {
			if (op === 'delete') {
				await kit.delete(comments).where(eq(comments.id, id));
				continue;
			}
			const status: Status =
				op === 'approve'
					? 'approved'
					: op === 'pending'
						? 'pending'
						: op === 'spam'
							? 'spam'
							: 'rejected';
			await kit.update(comments).set({ status, moderatedAt: now }).where(eq(comments.id, id));
			if (op === 'approve') await notifyCommentApproved(db, platform?.env.AI_SECRET, id);
		}
		return { ok: true, message: `已處理 ${ids.length} 則評論` };
	},
	delete: async ({ request, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { error: '資料庫未配置' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: '缺少 comment id' });

		const kit = getDb(db);
		await kit.delete(comments).where(eq(comments.id, id));
	}
};
