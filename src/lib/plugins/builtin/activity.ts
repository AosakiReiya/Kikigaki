/**
 * Built-in plugin: activity beacon (Phase 21's action-side demo).
 * Subscribes to events purely via hooks, writing "last publish / last comment" times into site_settings —
 * touching no route/core code path: living proof that "a plugin plugs in via hooks without invading Core".
 * Writes only via ctx.db (no cross-request memory state; meets Workers constraints).
 */
import { getDb } from '$lib/server/db';
import { siteSettings } from '$lib/server/db/schema';
import type { HookContext, Plugin } from '../types';

const KEY_LAST_PUBLISH = 'last_publish_at';
const KEY_LAST_COMMENT = 'last_comment_at';

async function stamp(ctx: HookContext, key: string) {
	if (!ctx.db) return;
	const kit = getDb(ctx.db);
	const now = new Date();
	await kit
		.insert(siteSettings)
		.values({ key, value: now.toISOString(), updatedAt: now })
		.onConflictDoUpdate({
			target: siteSettings.key,
			set: { value: now.toISOString(), updatedAt: now }
		});
}

export const activityPlugin: Plugin = {
	manifest: {
		id: 'builtin-activity',
		name: 'Site Activity Beacon',
		description: '記錄最後發布文章與最後通過留言的時間（供未來儀表板）。',
		capabilities: ['write:settings']
	},
	hooks: {
		on: {
			'post:published': async (e, ctx) => {
				if (!e.published) return;
				await stamp(ctx, KEY_LAST_PUBLISH);
			},
			'comment:created': async (e, ctx) => {
				if (!e.approved) return;
				await stamp(ctx, KEY_LAST_COMMENT);
			}
		}
	}
};
