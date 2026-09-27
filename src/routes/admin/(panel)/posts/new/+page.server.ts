import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { posts, postTranslations } from '$lib/server/db/schema';
import { emit } from '$lib/plugins';
import type { Actions } from './$types';

function slugify(input: string): string {
	const base = input
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return base || `post-${Date.now().toString(36)}`;
}

export const actions: Actions = {
	create: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		if (!title) return fail(400, { message: '標題不能為空' });

		const kit = getDb(db);
		const base = slugify(title);
		let slug = base;
		let n = 2;
		while (
			(await kit.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1)).length >
			0
		) {
			slug = `${base}-${n++}`;
		}

		// create the post body + base-language (zh-tw) translation together (content fields live in post_translations)
		const now = new Date();
		await kit.insert(posts).values({ id: `post:${slug}`, slug, createdAt: now, updatedAt: now });
		await kit.insert(postTranslations).values({
			id: `tr:${slug}:zh-tw`,
			postId: `post:${slug}`,
			locale: 'zh-tw',
			title,
			createdAt: now,
			updatedAt: now
		});

		// CJK slugs need percent-encoding (Location headers don't accept raw non-ASCII)
		await emit('post:created', { slug, locale: 'zh-tw', published: false }, { db });
		throw redirect(303, `/admin/posts/${encodeURIComponent(slug)}`);
	}
};
