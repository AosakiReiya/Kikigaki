import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { posts, postTranslations } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { chat } from '$lib/server/ai';
import type { RequestHandler } from './$types';

/* * AI-generated SEO description (Phase 61): summarize the body with the "seo" task model into one ≤160-char sentence */
export const POST: RequestHandler = async ({ params, platform, request }) => {
	const db = platform?.env.DB;
	if (!db) error(500, 'database not configured');
	const body = (await request.json().catch(() => ({}))) as {
		locale?: string;
		title?: string;
		summary?: string;
		content?: string;
	};
	const locale = body.locale ?? 'zh-tw';
	const kit = getDb(db);
	const postId = `post:${params.slug}`;
	let title = String(body.title ?? '').trim();
	let summary = String(body.summary ?? '');
	let content = String(body.content ?? '');

	// fall back to current DB values when content wasn't edited (agents/legacy pages may call this endpoint directly)
	if (!content) {
		const [row] = await kit
			.select({
				title: postTranslations.title,
				summary: postTranslations.summary,
				body: postTranslations.body
			})
			.from(posts)
			.innerJoin(
				postTranslations,
				and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, locale))
			)
			.where(eq(posts.id, postId))
			.limit(1);
		if (!row) error(404, '找不到這篇文章');
		title ||= row.title;
		summary = summary || row.summary;
		content = row.body;
	}
	if (!title) error(400, '缺少標題');

	const excerpt = content
		.replace(/```[\s\S]*?```/g, ' [code] ')
		.replace(/[#>*_~`!-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 3500);
	const r = await chat(db, platform?.env.AI_SECRET, {
		task: 'seo',
		messages: [
			{
				role: 'system',
				content:
					'你是部落格 SEO 編輯。根據文章內容寫一句搜尋引擎 meta description：一句話、不超過 160 字、以文章本身語言撰寫、不重複標題原文、不要 emoji、不要引號、直接輸出內容本身。'
			},
			{
				role: 'user',
				content: `標題：${title}\n摘要：${summary || '（無）'}\n內文：${excerpt}`
			}
		],
		maxTokens: 220,
		temperature: 0.4
	});
	if (!r.ok) error(502, r.error);
	const text = (r.text ?? '')
		.trim()
		.replace(/^["「『]|["」』]$/g, '')
		.slice(0, 200);
	return json({ description: text });
};
