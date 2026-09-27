import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { posts, postTranslations } from '$lib/server/db/schema';
import {
	countSubscribers,
	listSubscribers,
	removeSubscriber,
	sendNewsletter,
	subscribe
} from '$lib/server/subscribers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db)
		return {
			dbReady: false as const,
			subs: [],
			counts: { pending: 0, active: 0, unsubscribed: 0 },
			postOptions: []
		};
	const kit = getDb(db);
	const postRows = await kit
		.select({ slug: posts.slug, title: postTranslations.title })
		.from(posts)
		.leftJoin(postTranslations, eq(postTranslations.postId, posts.id))
		.where(eq(posts.published, true))
		.orderBy(desc(posts.publishedAt))
		.limit(60);
	// same slug across locales prefers zh-tw
	const seen = new Map<string, string>();
	for (const r of postRows) if (!seen.has(r.slug)) seen.set(r.slug, r.title ?? r.slug);
	return {
		dbReady: true as const,
		subs: await listSubscribers(db),
		counts: await countSubscribers(db),
		postOptions: [...seen.entries()].map(([slug, title]) => ({ slug, title }))
	};
};

export const actions: Actions = {
	add: async ({ request, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const r = await subscribe(db, platform.env.AI_SECRET, { email, source: 'admin' });
		return r.ok
			? { ok: true, message: `已發出確認信（${email}）` }
			: fail(400, { message: r.error ?? '訂閱失敗' });
	},
	remove: async ({ request, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		await removeSubscriber(db, String(form.get('id') ?? ''));
		return { ok: true, message: '已移除' };
	},
	send: async ({ request, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const slug = String(form.get('postSlug') ?? '').trim();
		if (!slug) return fail(400, { message: '請選擇文章' });
		const r = await sendNewsletter(db, platform.env.AI_SECRET, { postSlug: slug });
		return r.errors.length && r.sent === 0
			? fail(400, { message: r.errors.join('；') })
			: {
					ok: true,
					message: `已發送 ${r.sent} 封（失敗 ${r.failed}）${r.errors.length ? '：' + r.errors[0] : ''}`
				};
	}
};
