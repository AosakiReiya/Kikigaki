/**
 * Phase 70 — reply notifications: when a comment is replied to AND approved, email the
 * comment_reply template to the original author if they left an email.
 * best-effort: any failure only logs to email_logs, never blocks the comment flow.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { comments, postTranslations, posts, siteSettings } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';
import { sendTemplatedEmail } from '$lib/server/email-templates';
import { site } from '$lib/site';

/** single entry for the approval exit: has parent = reply notification; top-level = owner new_comment notification (if an address is set) */
export async function notifyCommentApproved(
	db: D1Database,
	masterKey: string | undefined,
	commentId: string
): Promise<void> {
	const kit = getDb(db);
	const [c] = await kit
		.select({ parentId: comments.parentId })
		.from(comments)
		.where(eq(comments.id, commentId))
		.limit(1);
	if (!c) return;
	if (c.parentId) await notifyReplyApproved(db, masterKey, commentId);
	else await notifyAdminNewComment(db, masterKey, commentId);
}

/** owner new-comment notification (settings Email card "owner notify address"; unset = silently skipped) */
export async function notifyAdminNewComment(
	db: D1Database,
	masterKey: string | undefined,
	commentId: string
): Promise<void> {
	try {
		const kit = getDb(db);
		const [addr] = await kit
			.select({ value: siteSettings.value })
			.from(siteSettings)
			.where(eq(siteSettings.key, 'email_admin_notify'))
			.limit(1);
		const to = (addr?.value ?? '').trim();
		if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return;
		const [c] = await kit
			.select({
				name: comments.name,
				content: comments.content,
				status: comments.status,
				parentId: comments.parentId,
				postId: comments.postId
			})
			.from(comments)
			.where(eq(comments.id, commentId))
			.limit(1);
		if (!c || c.status !== 'approved' || c.parentId) return;
		const [post] = await kit
			.select({
				slug: posts.slug,
				title: postTranslations.title,
				summary: postTranslations.summary
			})
			.from(posts)
			.leftJoin(
				postTranslations,
				and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, 'zh-tw'))
			)
			.where(eq(posts.id, c.postId))
			.limit(1);
		if (!post) return;
		const base = `${site.url}/blog/${post.slug}`;
		await sendTemplatedEmail(db, masterKey, {
			to,
			type: 'new_comment',
			vars: {
				'post.title': post.title ?? post.slug,
				'post.url': base,
				'post.summary': post.summary ?? '',
				'comment.author': c.name,
				'comment.content': c.content.slice(0, 800),
				'comment.url': `${base}#c-${commentId}`
			}
		});
	} catch (e) {
		console.error('[comment-notify] admin notify failed:', String(e).slice(0, 200));
	}
}

export async function notifyReplyApproved(
	db: D1Database,
	masterKey: string | undefined,
	commentId: string
): Promise<void> {
	try {
		const kit = getDb(db);
		// new reply (must be approved and have a parent)
		const [reply] = await kit
			.select({
				id: comments.id,
				name: comments.name,
				content: comments.content,
				status: comments.status,
				parentId: comments.parentId,
				postId: comments.postId
			})
			.from(comments)
			.where(eq(comments.id, commentId))
			.limit(1);
		if (!reply || reply.status !== 'approved' || !reply.parentId) return;
		const [parent] = await kit
			.select({ id: comments.id, name: comments.name, email: comments.email })
			.from(comments)
			.where(eq(comments.id, reply.parentId))
			.limit(1);
		if (!parent?.email) return; // no email left = no notification
		const [post] = await kit
			.select({ slug: posts.slug, title: postTranslations.title })
			.from(posts)
			.leftJoin(
				postTranslations,
				and(eq(postTranslations.postId, posts.id), eq(postTranslations.locale, 'zh-tw'))
			)
			.where(eq(posts.id, reply.postId))
			.limit(1);
		if (!post) return;
		const base = `${site.url}/blog/${post.slug}`;
		await sendTemplatedEmail(db, masterKey, {
			to: parent.email,
			type: 'comment_reply',
			vars: {
				'user.name': parent.name,
				'user.email': parent.email,
				'post.title': post.title ?? post.slug,
				'post.url': base,
				'comment.author': reply.name,
				'comment.content': reply.content.slice(0, 800),
				'comment.url': `${base}#c-${reply.id}`
			}
		});
	} catch (e) {
		console.error('[comment-notify] best-effort failed:', String(e).slice(0, 200));
	}
}
