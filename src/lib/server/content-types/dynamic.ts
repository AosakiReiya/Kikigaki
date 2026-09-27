/**
 * Phase 79b — materialise DB manifests as ContentTypeManifests.
 *
 * Generic types are storage:'generic' + sitemap:false: their refs read
 * content_items (so 79d can flip them into index consumers), but nothing
 * consumes them yet — public routes arrive with the first shipped type.
 */
import { getDb } from '$lib/server/db';
import { contentItems } from '$lib/server/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { listTypes, parseFields } from '../content-items';
import type { ContentItemRef, ContentTypeManifest } from './types';

/** 79d: public routes wired — detail /key/slug, list /key ([slug]/[item] route tree) */
export function dynamicPath(key: string, slug: string): string {
	return `/${key}/${slug}`;
}
export function dynamicListPath(key: string): string {
	return `/${key}`;
}

export async function loadDynamicManifests(
	db: D1Database | undefined
): Promise<ContentTypeManifest[]> {
	if (!db) return [];
	const types = (await listTypes(db)).filter((t) => t.enabled);
	return types.map((t) => {
		const key = t.key;
		const manifest: ContentTypeManifest = {
			key,
			storage: 'generic',
			sitemap: true,
			label: t.label,
			listPath: dynamicListPath(key),
			pathFor: (slug) => dynamicPath(key, slug),
			jsonLdType: 'ItemPage',
			fields: parseFields(t.fieldsRaw).fields,
			async refs(d: D1Database | undefined): Promise<ContentItemRef[]> {
				if (!d) return [];
				const rows = await getDb(d)
					.select({ slug: contentItems.slug })
					.from(contentItems)
					.where(and(eq(contentItems.typeKey, key), eq(contentItems.published, 1)))
					.orderBy(asc(contentItems.sortOrder))
					.all();
				return rows.map((r) => ({ slug: r.slug }));
			}
		};
		return manifest;
	});
}
