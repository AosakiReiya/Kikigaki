import { fail } from '@sveltejs/kit';
import {
	listRegistry,
	listVersions,
	setEnabled,
	setReview,
	rollbackTo,
	uninstall,
	type RegistryKind
} from '$lib/server/registry';
import { invalidatePluginGate } from '$lib/plugins/server';
import { installExtension, uninstallExtension } from '$lib/server/extensions/install';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { dbReady: false as const, items: [], versionsByItem: {} };
	const items = await listRegistry(db);
	const versionsByItem: Record<string, { version: number; note: string; createdAt: number }[]> = {};
	for (const it of items) {
		versionsByItem[it.id] = (await listVersions(db, it.id)).map((v) => ({
			version: v.version,
			note: v.note,
			createdAt: v.createdAt
		}));
	}
	return { dbReady: true as const, items, versionsByItem };
};

async function needItem(db: NonNullable<Parameters<typeof listRegistry>[0]>, id: string) {
	return (await listRegistry(db)).find((i) => i.id === id);
}

export const actions: Actions = {
	/* * P83c: paste a manifest JSON to install an extension (types/components/slots/settings land in one shot) */
	installExt: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await installExtension(db, String(form.get('manifest') ?? ''));
		if (!r.ok) return fail(400, { message: r.errors.join('；').slice(0, 300) });
		invalidatePluginGate();
		const s = r.summary;
		return {
			ok: true,
			message: `已安裝 v${r.version}：元件 ${s.components.length}、型別 +${s.typesCreated.length}${
				s.typesSkipped.length ? `（跳過既有 ${s.typesSkipped.join(',')}）` : ''
			}${s.errors.length ? `；部分錯誤：${s.errors.join('；').slice(0, 200)}` : ''}`
		};
	},

	uninstallExt: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const r = await uninstallExtension(db, String(form.get('slug') ?? ''));
		if (!r.ok) return fail(400, { message: r.errors.join('；') });
		invalidatePluginGate();
		return { ok: true, message: '已卸載（內容型別與資料保留，删除請至 /admin/content）' };
	},

	toggle: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const enabled = form.get('enabled') === 'on';
		const r = await setEnabled(db, id, enabled);
		invalidatePluginGate();
		return r.ok
			? { ok: true, message: enabled ? '已啟用' : '已停用' }
			: fail(400, { message: r.error });
	},

	review: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const review = String(form.get('review') ?? 'approved') as 'approved' | 'pending';
		const r = await setReview(db, id, review);
		return r.ok
			? { ok: true, message: review === 'approved' ? '已批准（即時可服務）' : '已退回待審' }
			: fail(400, { message: r.error });
	},

	rollback: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const to = Number(form.get('version') ?? '0');
		const r = await rollbackTo(db, id, to);
		invalidatePluginGate();
		return r.ok
			? { ok: true, message: `已回滾（現版本 v${r.version}）` }
			: fail(400, { message: r.error });
	},

	uninstall: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const item = await needItem(db, id);
		if (item?.source === 'official') return fail(400, { message: '官方項目不可卸載（可停用）' });
		const r = await uninstall(db, id);
		invalidatePluginGate();
		return r.ok ? { ok: true, message: '已卸載' } : fail(400, { message: r.error });
	}
};

export type { RegistryKind };
