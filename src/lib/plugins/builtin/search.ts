/**
 * Built-in plugin: search index supplier (Phase 21's first real "plugin eats its own dogfood" case).
 * Core's +layout.server no longer knows "which content types are searchable" — it only asks the filter 'search:index';
 * this plugin folds posts + custom pages into the index. Pages/activity calendars/document libraries… each add a supplier later.
 */
import { getPublishedPostSummaries } from '$lib/server/content';
import { getPublishedPageSummaries } from '$lib/server/pages';
import type { Plugin, SearchIndexEntry } from '../types';

export const searchPlugin: Plugin = {
	manifest: {
		id: 'builtin-search',
		name: 'Search Index (posts + pages)',
		description: '為全站搜索彈層提供文章與自訂頁面索引。',
		capabilities: ['read:content']
	},
	hooks: {
		filter: {
			'search:index': async (value, ctx) => {
				const { db, locale } = ctx;
				if (!db) return value;
				const base = locale ?? 'zh-tw';
				const [posts, pages] = await Promise.all([
					getPublishedPostSummaries(db, base),
					getPublishedPageSummaries(db, base)
				]);
				const entries: SearchIndexEntry[] = [
					...posts.map((p) => ({
						slug: p.slug,
						kind: 'post' as const,
						title: p.title,
						summary: p.summary,
						tags: p.tags
					})),
					...pages.map((p) => ({
						slug: p.slug,
						kind: 'page' as const,
						title: p.title,
						summary: p.summary,
						tags: []
					}))
				];
				return [...value, ...entries];
			}
		}
	}
};
