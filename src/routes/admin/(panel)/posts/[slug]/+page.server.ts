import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	categories,
	comments,
	postSeo,
	postTags,
	posts,
	postTranslations,
	postVersions,
	tags
} from '$lib/server/db/schema';
import { upsertPostSeo } from '$lib/server/seo';
import { BASE_LOCALE } from '$lib/server/content';
import { customComponentNameList } from '$lib/server/components';
import { locales } from '$lib/paraglide/runtime';
import type { Locale } from '$lib/paraglide/runtime';
import { emit, applyFilter } from '$lib/plugins';
import type { Actions, PageServerLoad } from './$types';

/* * max versions kept per post per locale (oldest deleted past the cap) */
const VERSION_CAP = 50;

function isLocale(value: string | null | undefined): value is Locale {
	return !!value && (locales as readonly string[]).includes(value);
}

/* * snapshot current content as a version (git-style dedupe: identical to latest = skip; oldest auto-pruned) */
async function snapshotPost(
	kit: ReturnType<typeof getDb>,
	postId: string,
	locale: Locale,
	snap: { title: string; summary: string; body: string }
) {
	const [last] = await kit
		.select({ title: postVersions.title, summary: postVersions.summary, body: postVersions.body })
		.from(postVersions)
		.where(and(eq(postVersions.postId, postId), eq(postVersions.locale, locale)))
		.orderBy(desc(postVersions.createdAt))
		.limit(1);
	if (
		last &&
		last.title === snap.title &&
		last.summary === snap.summary &&
		last.body === snap.body
	) {
		return;
	}
	await kit.insert(postVersions).values({ postId, locale, ...snap });
	const overflow = await kit
		.select({ id: postVersions.id })
		.from(postVersions)
		.where(and(eq(postVersions.postId, postId), eq(postVersions.locale, locale)))
		.orderBy(desc(postVersions.createdAt))
		.limit(1000)
		.offset(VERSION_CAP);
	if (overflow.length > 0) {
		await kit.delete(postVersions).where(
			inArray(
				postVersions.id,
				overflow.map((v) => v.id)
			)
		);
	}
}

/* * upsert one locale's translation (exists → update, missing → insert; returns whether created) */
async function upsertTranslation(
	kit: ReturnType<typeof getDb>,
	postId: string,
	locale: Locale,
	values: { title: string; summary: string; body: string }
) {
	const [existing] = await kit
		.select({ id: postTranslations.id })
		.from(postTranslations)
		.where(and(eq(postTranslations.postId, postId), eq(postTranslations.locale, locale)))
		.limit(1);
	const now = new Date();
	if (existing) {
		await kit
			.update(postTranslations)
			.set({ ...values, updatedAt: now })
			.where(eq(postTranslations.id, existing.id));
	} else {
		await kit
			.insert(postTranslations)
			.values({ postId, locale, ...values, createdAt: now, updatedAt: now });
	}
}

export const load: PageServerLoad = async ({ params, url, platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');

	const kit = getDb(db);
	const id = `post:${params.slug}`;

	const postRows = await kit.select().from(posts).where(eq(posts.id, id)).limit(1);
	const post = postRows[0];
	if (!post) error(404, '找不到這篇文章');

	const activeLocale: Locale = isLocale(url.searchParams.get('l'))
		? (url.searchParams.get('l') as Locale)
		: BASE_LOCALE;

	const translationRows = await kit
		.select()
		.from(postTranslations)
		.where(eq(postTranslations.postId, id));
	const tagRows = await kit
		.select({ name: tags.name })
		.from(postTags)
		.innerJoin(tags, eq(postTags.tagId, tags.id))
		.where(eq(postTags.postId, id));

	// TagPicker suggestion list (all tags; admin uses base names)
	const allTagRows = await kit.select({ name: tags.name }).from(tags).orderBy(tags.name);

	const [commentRow] = await kit
		.select({ count: sql<number>`count(*)` })
		.from(comments)
		.where(eq(comments.postId, id));

	const recentComments = await kit
		.select()
		.from(comments)
		.where(eq(comments.postId, id))
		.orderBy(desc(comments.createdAt))
		.limit(5);

	// version history: fetch all locales at once, group client-side (tab switches never hit the server again)
	const versionRows = await kit
		.select()
		.from(postVersions)
		.where(eq(postVersions.postId, id))
		.orderBy(desc(postVersions.createdAt))
		.limit(4 * VERSION_CAP);
	const versionsByLocale: Record<string, (typeof versionRows)[number][]> = {};
	for (const v of versionRows) {
		(versionsByLocale[v.locale] ??= []).push(v);
	}

	/* * per-locale full translations (tab switching is a pure front-end partial refresh) */
	const translations: Record<string, { title: string; summary: string; body: string }> = {};
	for (const t of translationRows) {
		translations[t.locale] = { title: t.title, summary: t.summary, body: t.body };
	}

	/* * per-locale SEO overrides (Phase 61; locales without rows render as empty forms) */
	const seoRows = await kit.select().from(postSeo).where(eq(postSeo.postId, id));
	const seo: Record<string, Record<string, unknown>> = {};
	for (const s of seoRows) seo[s.locale] = { ...s };

	return {
		post,
		/* * initial edit locale (the component takes over subsequent switches via URL ?l) */
		activeLocale,
		translations,
		seo,
		versionsByLocale,
		/* * which locales have translations (for tab indicators) */
		coveredLocales: translationRows.map((t) => t.locale),
		/* * base-language title (displayed outside tabs) */
		baseTitle: translationRows.find((t) => t.locale === BASE_LOCALE)?.title ?? '',
		tags: tagRows.map((t) => t.name),
		allTagNames: allTagRows.map((t) => t.name),
		// ComponentPicker :::post candidates (79a-slim: fetched by the admin edit page itself, no longer site-wide resident)
		searchIndex: await applyFilter('search:index', [], { db, locale: BASE_LOCALE }),
		commentCount: commentRow?.count ?? 0,
		recentComments,
		customNames: await customComponentNameList(db),
		/* * dynamic category options (for dropdowns; base names displayed) */
		categoryOptions: await kit
			.select({ slug: categories.slug, name: categories.name })
			.from(categories)
			.orderBy(categories.sort)
	};
};

function splitTags(raw: string | null): string[] {
	const list = (raw ?? '')
		.split(/[,，]/)
		.map((t) => t.trim())
		.filter(Boolean);
	return [...new Set(list)];
}

export const actions: Actions = {
	/* * save: current-locale translation + shared metadata + tag rebuild */
	save: async ({ params, platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const kit = getDb(db);
		const id = `post:${params.slug}`;

		const form = await request.formData();
		const localeParam = String(form.get('locale') ?? '');
		if (!isLocale(localeParam)) return fail(400, { message: '語系不正確' });
		const locale = localeParam;

		const title = String(form.get('title') ?? '').trim();
		const summary = String(form.get('summary') ?? '').trim();
		const body = String(form.get('body') ?? '').replace(/\r\n?/g, '\n');
		const date = String(form.get('date') ?? '').trim();
		const cover = String(form.get('cover') ?? '').trim() || null;
		const tagNames = splitTags(String(form.get('tags') ?? ''));
		const published = form.get('published') === 'on';
		const pinned = form.get('pinned') === 'on';
		const seriesOnly = form.get('series_only') === 'on';
		// dynamic categories: only existing slugs accepted, otherwise fall back to article (the posts.type default)
		const rawType = String(form.get('type') ?? '').trim();
		const [catRow] = await kit
			.select({ slug: categories.slug })
			.from(categories)
			.where(eq(categories.slug, rawType))
			.limit(1);
		const type = catRow?.slug ?? 'article';

		if (!title) return fail(400, { message: '標題不能為空' });

		const existing = await kit.select().from(posts).where(eq(posts.id, id)).limit(1);
		if (existing.length === 0) error(404, '找不到這篇文章');
		const wasPublished = existing[0].published;

		// Phase 67 scheduled publishing: unpublished + future time → publishedAt = schedule; publishDuePosts flips it live when due
		const scheduledRaw = String(form.get('scheduledAt') ?? '').trim();
		const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
		const isScheduled =
			!published &&
			scheduledAt !== null &&
			!Number.isNaN(scheduledAt.getTime()) &&
			scheduledAt > new Date();
		const publishedAt = isScheduled
			? scheduledAt
			: published && date
				? new Date(`${date}T00:00:00Z`)
				: (existing[0].publishedAt ?? new Date());
		// clearing the schedule publishes immediately: empty date uses the current value
		await kit
			.update(posts)
			.set({
				cover,
				type,
				published,
				pinned,
				seriesOnly,
				publishedAt,
				updatedAt: new Date()
			})
			.where(eq(posts.id, id));

		await upsertTranslation(kit, id, locale, { title, summary, body });

		// rebuild tags
		await kit.delete(postTags).where(eq(postTags.postId, id));
		if (tagNames.length > 0) {
			for (const name of tagNames) {
				await kit
					.insert(tags)
					.values({ id: `tag:${name}`, name, slug: name.toLowerCase() })
					.onConflictDoNothing();
			}
			const tagRows = await kit
				.select({ id: tags.id })
				.from(tags)
				.where(inArray(tags.name, tagNames));
			await kit
				.insert(postTags)
				.values(tagRows.map((t) => ({ postId: id, tagId: t.id })))
				.onConflictDoNothing();
		}

		// auto snapshot on every save (git-style version history; per locale)
		await snapshotPost(kit, id, locale, { title, summary, body });

		// event (Phase 21): creation happens in posts/new; here only updated and publish transitions are emitted
		await emit('post:updated', { slug: params.slug, locale, published }, { db });
		if (published && !wasPublished) {
			await emit('post:published', { slug: params.slug, locale, published: true }, { db });
		} else if (!published && wasPublished) {
			await emit('post:unpublished', { slug: params.slug, locale, published: false }, { db });
		}

		return { ok: true, message: '已儲存', locale };
	},

	/* * SEO overrides (Phase 61): per-locale upsert; empty field = clear the override */
	seo: async ({ params, platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const id = `post:${params.slug}`;
		const form = await request.formData();
		const localeParam = String(form.get('locale') ?? '');
		if (!isLocale(localeParam)) return fail(400, { message: '語系不正確' });

		const snippetRaw = String(form.get('max_snippet') ?? '').trim();
		await upsertPostSeo(db, id, localeParam, {
			seoTitle: String(form.get('seo_title') ?? ''),
			seoDescription: String(form.get('seo_description') ?? ''),
			canonicalUrl: String(form.get('canonical_url') ?? ''),
			robotsIndex: form.get('robots_index') === 'on',
			robotsFollow: form.get('robots_follow') === 'on',
			maxSnippet: snippetRaw === '' ? null : Number(snippetRaw),
			maxImagePreview: String(form.get('max_image_preview') ?? '') || null,
			schemaType: String(form.get('schema_type') ?? '') || null,
			ogTitle: String(form.get('og_title') ?? ''),
			ogDescription: String(form.get('og_description') ?? ''),
			ogImage: String(form.get('og_image') ?? ''),
			ogImageAlt: String(form.get('og_image_alt') ?? ''),
			twitterCard: String(form.get('twitter_card') ?? ''),
			seoAuthor: String(form.get('seo_author') ?? '')
		});
		return { ok: true, message: 'SEO 設定已儲存' };
	},

	/* * restore to a version (snapshots current content first — a mistaken restore can be undone) */
	restore: async ({ params, platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const kit = getDb(db);
		const id = `post:${params.slug}`;

		const form = await request.formData();
		const versionId = String(form.get('versionId') ?? '');
		if (!versionId) return fail(400, { message: '缺少版本 ID' });

		const [version] = await kit
			.select()
			.from(postVersions)
			.where(eq(postVersions.id, versionId))
			.limit(1);
		if (!version || version.postId !== id) return fail(404, { message: '找不到這個版本' });
		if (!isLocale(version.locale)) return fail(400, { message: '版本語系不正確' });
		const locale: Locale = version.locale;

		// first snapshot this locale's pre-restore content (becomes a new version)
		const [current] = await kit
			.select()
			.from(postTranslations)
			.where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, locale)))
			.limit(1);
		if (current) {
			await snapshotPost(kit, id, locale, {
				title: current.title,
				summary: current.summary,
				body: current.body
			});
		}

		await kit
			.update(postTranslations)
			.set({
				title: version.title,
				summary: version.summary,
				body: version.body.replace(/\r\n?/g, '\n'),
				updatedAt: new Date()
			})
			.where(and(eq(postTranslations.postId, id), eq(postTranslations.locale, locale)));

		await kit.update(posts).set({ updatedAt: new Date() }).where(eq(posts.id, id));

		return {
			ok: true,
			message: `已還原到 ${new Date(version.createdAt).toLocaleString('zh-TW')} 的版本（${locale}）`
		};
	},

	/* * delete a version snapshot (the post itself is unaffected) */
	deleteVersion: async ({ params, platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const kit = getDb(db);
		const id = `post:${params.slug}`;

		const form = await request.formData();
		const versionId = String(form.get('versionId') ?? '');
		if (!versionId) return fail(400, { message: '缺少版本 ID' });

		const [version] = await kit
			.select({ id: postVersions.id, postId: postVersions.postId })
			.from(postVersions)
			.where(eq(postVersions.id, versionId))
			.limit(1);
		if (!version || version.postId !== id) return fail(404, { message: '找不到這個版本' });

		await kit.delete(postVersions).where(eq(postVersions.id, versionId));
		return { ok: true, message: '版本已刪除' };
	},

	/* * delete a post (comments/tags/translations cascade) */
	delete: async ({ params, platform }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const kit = getDb(db);
		await kit.delete(posts).where(eq(posts.id, `post:${params.slug}`));
		throw redirect(303, '/admin/posts');
	}
};
