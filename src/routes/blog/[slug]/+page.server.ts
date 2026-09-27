import { error } from '@sveltejs/kit';
import {
	BASE_LOCALE,
	getAdjacentPosts,
	getPost,
	getPostBooks,
	getPostSummariesBySlugs
} from '$lib/server/content';
import type { SearchIndexEntry } from '$lib/plugins/types';
import { getPostSeo, resolveSeo } from '$lib/server/seo';
import type { Locale } from '$lib/paraglide/runtime';
import type { PageServerLoad } from './$types';

/* * 79a-slim: :::post embed cards prefetch only the referenced posts (replaces the site-wide searchIndex) */
function embedSlugs(html: string, self: string): string[] {
	const out: string[] = [];
	for (const m of html.matchAll(/data-cc="post"[^>]*data-cc-props="([^"]+)"/g)) {
		try {
			const json = m[1]
				.replaceAll('&quot;', '"')
				.replaceAll('&lt;', '<')
				.replaceAll('&gt;', '>')
				.replaceAll('&amp;', '&');
			const slug = (JSON.parse(json) as { slug?: unknown }).slug;
			if (typeof slug === 'string' && slug && slug !== self) out.push(slug);
		} catch {
			/* 解不了就留給渲染端顯示「找不到」卡，不擴散 */
		}
	}
	return [...new Set(out)].slice(0, 8);
}

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');

	const locale: Locale = locals.locale ?? BASE_LOCALE;
	const post = await getPost(db, params.slug, locale);
	if (!post) error(404, '找不到這篇文章');

	const [adjacent, seriesBooks, embedTargets] = await Promise.all([
		getAdjacentPosts(db, params.slug, locale),
		getPostBooks(db, locale, params.slug),
		getPostSummariesBySlugs(db, locale, embedSlugs(post.contentHtml, params.slug))
	]);

	const seo = await getPostSeo(db, `post:${params.slug}`, locale);
	const seoOver = resolveSeo(seo, { title: post.title, description: post.summary });

	return {
		post,
		adjacent,
		seriesBooks,
		/** PostEmbed 卡資料（依目前語系解析；未發布/不存在＝缺項走「找不到」卡） */
		embeds: embedTargets.map((p): SearchIndexEntry => ({
			slug: p.slug,
			kind: 'post' as const,
			title: p.title,
			summary: p.summary,
			tags: p.tags.map((t) => ({ name: t.name, display: t.display }))
		})),
		// hreflang 只列實際有翻譯的語系（SEO：不宣告退回頁）
		hreflangLocales: post.availableLocales,
		/** JSON-LD 覆寫來源（Phase 63） */
		seoLite: {
			schemaType: seo?.schemaType ?? null,
			author: seo?.seoAuthor ?? null,
			ogImage: seo?.ogImage ?? null
		},
		meta: {
			title: seoOver.title ?? post.title,
			description: seoOver.description ?? post.summary,
			path: `/blog/${post.slug}`,
			image: post.cover,
			type: 'article' as const,
			publishedTime: post.date,
			modifiedTime: post.updatedAt,
			section: post.categoryDisplay,
			tags: post.tags,
			// OG 覆寫鏈（post_seo → 文章欄位 → 站級預設於 buildMeta 之後處理）
			...(seo?.ogTitle ? { ogTitle: seo.ogTitle } : {}),
			...(seo?.ogDescription ? { ogDescription: seo.ogDescription } : {}),
			...(seo?.ogImageAlt ? { ogImageAlt: seo.ogImageAlt } : {}),
			...(seo?.twitterCard ? { twitterCard: seo.twitterCard } : {}),
			...(seo?.ogImage ? { image: seo.ogImage } : {}),
			// SEO 覆寫（Phase 61）：僅在有值時出現，SSR 直出
			...(seoOver.canonical ? { canonical: seoOver.canonical } : {}),
			...(seoOver.robots ? { robots: seoOver.robots } : {})
		}
	};
};
