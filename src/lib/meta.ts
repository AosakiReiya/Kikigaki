import { site } from '$lib/site';

/** language-neutral subset of the post_seo row (robots meta generation input; NULL/true = default emits no tag) */
export interface RobotsInput {
	index?: boolean | null;
	follow?: boolean | null;
	maxSnippet?: number | null;
	maxImagePreview?: string | null;
}

/**
 * robots meta directive generation (Phase 61). Default combination returns null = emit no tag at all
 * (Google defaults to index,follow,max-image-preview:large; redundancy avoided).
 */
export function robotsContent(r: RobotsInput): string | null {
	const parts: string[] = [];
	if (r.index === false) parts.push('noindex');
	else if (r.index) parts.push('index');
	if (r.follow === false) parts.push('nofollow');
	else if (r.follow) parts.push('follow');
	if (r.maxSnippet != null) {
		if (r.maxSnippet < 0) parts.push('nosnippet');
		else parts.push(`max-snippet:${r.maxSnippet}`);
	}
	if (r.maxImagePreview && r.maxImagePreview !== 'large')
		parts.push(`max-image-preview:${r.maxImagePreview}`);
	// pure default (index, follow) emits no tag
	if (parts.length > 0 && parts.every((p) => p === 'index' || p === 'follow')) return null;
	return parts.length > 0 ? parts.join(', ') : null;
}

export interface MetaInput {
	title: string;
	description: string;
	path: string;
	/** override absolute URL (localized canonical; default site.url + path) */
	url?: string;
	/** custom canonical (e.g. external original declaration); does not affect og:url */
	canonical?: string | null;
	image?: string;
	type?: 'website' | 'article';
	publishedTime?: string;
	modifiedTime?: string;
	/** OG override chain (post_seo): unset = derived values */
	ogTitle?: string;
	ogDescription?: string;
	ogImageAlt?: string;
	twitterCard?: string | null;
	twitterSite?: string;
	/** category display name (article:section) */
	section?: string;
	/** tags: string or TagRef (display ?? name) — pushing raw objects used to yield [object Object] */
	tags?: (string | { name: string; display?: string })[];
	noindex?: boolean;
	/** robots meta directive (produced by robotsContent(); overrides noindex when given) */
	robots?: string | null;
}

/** generate SEO / OpenGraph tags for <svelte:head> */
export function buildMeta(input: MetaInput) {
	const url = input.url ?? `${site.url}${input.path}`;
	const title = input.title === site.title ? site.title : `${input.title} — ${site.title}`;
	const image = input.image ? new URL(input.image, site.url).href : undefined;

	const ogTitle = input.ogTitle ?? title;
	const ogDescription = input.ogDescription ?? input.description;
	const card = input.twitterCard ?? (image ? 'summary_large_image' : 'summary');

	const tags: Array<{ name?: string; property?: string; content: string }> = [
		{ name: 'description', content: input.description },
		{ property: 'og:title', content: ogTitle },
		{ property: 'og:description', content: ogDescription },
		{ property: 'og:type', content: input.type ?? 'website' },
		{ property: 'og:url', content: url },
		{ property: 'og:site_name', content: site.title },
		{ name: 'twitter:card', content: card },
		{ name: 'twitter:title', content: ogTitle },
		{ name: 'twitter:description', content: ogDescription }
	];
	if (input.twitterSite) tags.push({ name: 'twitter:site', content: input.twitterSite });

	if (image) tags.push({ property: 'og:image', content: image });
	if (image && input.ogImageAlt) tags.push({ property: 'og:image:alt', content: input.ogImageAlt });
	if (image) tags.push({ name: 'twitter:image', content: image });
	if (input.publishedTime)
		tags.push({ property: 'article:published_time', content: input.publishedTime });
	if (input.modifiedTime && input.modifiedTime !== input.publishedTime)
		tags.push({ property: 'article:modified_time', content: input.modifiedTime });
	if (input.section) tags.push({ property: 'article:section', content: input.section });
	for (const t of input.tags ?? [])
		tags.push({
			property: 'article:tag',
			content: typeof t === 'string' ? t : t.display || t.name
		});
	const robots = input.robots ?? (input.noindex ? 'noindex' : null);
	if (robots) tags.push({ name: 'robots', content: robots });

	// canonical and og:url are separate: a custom canonical (external original) never rewrites og:url
	const canonical = input.canonical ?? url;
	return { title, url, canonical, tags };
}
