import { site } from '$lib/site';
import { BCP47 } from '$lib/i18n';

/** JSON-LD nodes (Phase 63): all pure functions, shared SSR/browser; dates follow a nullable policy */

const abs = (u: string): string => {
	try {
		return new URL(u, site.url).href;
	} catch {
		return u;
	}
};

/** nullable date → ISO8601 (Google requirement); invalid = omit the field ("leave no trace" policy) */
export const isoDate = (v: string | null | undefined): string | undefined => {
	if (!v) return undefined;
	const d = new Date(v.includes('T') ? v : `${v}T00:00:00Z`);
	return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

export const publisherPerson = (authorName?: string | null): Record<string, unknown> => ({
	'@type': 'Person',
	name: authorName?.trim() || site.author.name,
	url: site.url,
	image: abs(site.author.avatar),
	sameAs: site.socials.filter((s) => /^https?:/.test(s.url)).map((s) => s.url)
});

export interface ArticleInput {
	schemaType?: string | null;
	title: string;
	description: string;
	images: (string | null | undefined)[];
	datePublished?: string | null;
	dateModified?: string | null;
	authorName?: string | null;
	url: string;
	locale?: string;
	section?: string;
	tags?: string[];
	series?: { title: string; slug: string }[];
}

const bcp47 = (locale?: string | null): string =>
	(locale && (BCP47 as Record<string, string>)[locale]) || 'zh-TW';

const ARTICLE_TYPES = new Set(['Article', 'BlogPosting', 'NewsArticle']);

export function buildArticle(a: ArticleInput): Record<string, unknown> {
	const pub = publisherPerson(a.authorName);
	const images = [...new Set(a.images.filter(Boolean).map((i) => abs(i as string)))];
	const dp = isoDate(a.datePublished);
	const dm = isoDate(a.dateModified) ?? dp;
	return {
		'@context': 'https://schema.org',
		'@type': ARTICLE_TYPES.has(a.schemaType ?? '') ? a.schemaType : 'BlogPosting',
		headline: a.title,
		description: a.description,
		...(images.length ? { image: images } : {}),
		...(dp ? { datePublished: dp } : {}),
		...(dm ? { dateModified: dm } : {}),
		inLanguage: bcp47(a.locale),
		author: pub,
		publisher: pub,
		mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
		...(a.section ? { articleSection: a.section } : {}),
		...(a.tags?.length ? { keywords: a.tags.join(', ') } : {}),
		...(a.series?.length
			? {
					isPartOf: a.series.map((s) => ({
						'@type': 'Book',
						name: s.title,
						url: `${site.url}/series/${s.slug}`
					}))
				}
			: {})
	};
}

export interface Crumb {
	name: string;
	url: string;
}

export interface ProductInput {
	name: string;
	description?: string;
	image?: string;
	url: string;
	/** two-decimal string per the 79e price contract */
	price: string;
	currency: string;
}

/** 84：數位商品 Product＋Offer（priceContract 直通字串；InStock 語意=可立即交付）。 */
export function buildProduct(a: ProductInput): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'Product',
		name: a.name,
		...(a.description ? { description: a.description } : {}),
		...(a.image ? { image: abs(a.image) } : {}),
		productID: a.url,
		offers: {
			'@type': 'Offer',
			url: a.url,
			price: a.price,
			priceCurrency: a.currency.toUpperCase(),
			availability: 'https://schema.org/InStock'
		}
	};
}

export function buildBreadcrumb(items: Crumb[]): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((it, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: it.name,
			item: it.url
		}))
	};
}

export function buildWebSite(): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: site.title,
		url: site.url,
		description: site.description,
		publisher: publisherPerson(),
		potentialAction: {
			'@type': 'SearchAction',
			target: {
				'@type': 'EntryPoint',
				urlTemplate: `${site.url}/blog?q={search_term_string}`
			},
			'query-input': 'required name=search_term_string'
		}
	};
}

export function buildBook(
	book: { title: string; summary: string; slug: string; cover?: string | null },
	chapters: { title: string; slug: string }[],
	locale?: string
): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'Book',
		name: book.title,
		description: book.summary,
		url: `${site.url}/series/${book.slug}`,
		inLanguage: bcp47(locale),
		author: publisherPerson(),
		publisher: publisherPerson(),
		...(book.cover ? { image: abs(book.cover) } : {}),
		hasPart: chapters.map((c, i) => ({
			'@type': 'Chapter',
			position: i + 1,
			name: c.title,
			url: `${site.url}/series/${book.slug}/${c.slug}`
		}))
	};
}

/** multi-book ItemList for series pages */
export function buildItemList(
	name: string,
	items: { title: string; slug: string }[]
): Record<string, unknown> {
	return {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name,
		url: `${site.url}/series`,
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: items.length,
			itemListElement: items.map((b, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				item: { '@type': 'Book', name: b.title, url: `${site.url}/series/${b.slug}` }
			}))
		}
	};
}

/** for injection: JSON string ('<' escaped to prevent early script close) */
export function ldScript(node: Record<string, unknown>): string {
	return JSON.stringify(node).replace(/</g, '\\u003c');
}

/* ---- editor validation (display only, not reported) ---- */

export interface LdCheck {
	label: string;
	ok: boolean;
	level: 'error' | 'warn';
}

export function validateLdNode(n: Record<string, unknown>): LdCheck[] {
	const t = String(n['@type'] ?? '');
	const out: LdCheck[] = [];
	out.push({ label: 'JSON 有效', ok: true, level: 'error' });
	out.push({
		label: '@context = schema.org',
		ok: n['@context'] === 'https://schema.org',
		level: 'error'
	});
	if (t === 'Article' || t === 'BlogPosting' || t === 'NewsArticle') {
		out.push({ label: 'headline', ok: !!n.headline, level: 'error' });
		out.push({
			label: 'author',
			ok: (n.author as { name?: unknown } | undefined)?.name !== undefined,
			level: 'error'
		});
		out.push({ label: 'datePublished', ok: !!n.datePublished, level: 'warn' });
		out.push({ label: 'image（Rich Result 需要）', ok: !!n.image, level: 'warn' });
		out.push({ label: 'dateModified', ok: !!n.dateModified, level: 'warn' });
	} else if (t === 'BreadcrumbList') {
		const items = (n.itemListElement as unknown[]) ?? [];
		out.push({ label: `麵包屑 ${items.length} 層`, ok: items.length >= 2, level: 'warn' });
	}
	return out;
}
