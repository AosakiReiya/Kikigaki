import { fail } from '@sveltejs/kit';
import {
	listComponents,
	deleteComponent,
	setComponentEnabled,
	validateComponentFields,
	customComponentNameList
} from '$lib/server/components';
import {
	getRegistryItem,
	installArtifact,
	setEnabled,
	setReview,
	listComponentReviewStates,
	uninstall
} from '$lib/server/registry';
import { manifests } from '$lib/content-components/manifests';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env.DB;
	if (!db) return { ready: false as const };
	const [components, names, reviews] = await Promise.all([
		listComponents(db),
		customComponentNameList(db),
		listComponentReviewStates(db)
	]);
	return {
		ready: true as const,
		secretSet: Boolean(platform?.env.AI_SECRET),
		components,
		reviews,
		customNames: names,
		official: Object.entries(manifests).map(([name, m]) => ({ name, usage: m.usage }))
	};
};

export const actions: Actions = {
	save: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const code = String(form.get('code') ?? '');
		const description = String(form.get('description') ?? '').trim();
		const problem = validateComponentFields({ name, code });
		if (problem) return fail(400, { message: problem });
		const ai = form.get('ai') === 'on';
		// installed via the registry: version snapshot + source + review state (AI sources default to pending)
		const r = await installArtifact(db, {
			kind: 'component',
			slug: name,
			name,
			description,
			source: ai ? 'ai' : 'private',
			artifact: code,
			capabilities: ['self-contained']
		});
		if (!r.ok) return fail(400, { message: r.error });
		return {
			ok: true,
			message: ai
				? `元件「${name}」已安裝（v${r.version}），AI 來源待審查——到 Registry 批准後才對外服務`
				: `元件「${name}」已儲存並上線（v${r.version}）`
		};
	},

	delete: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (!name) return fail(400, { message: 'name_required' });
		const item = await getRegistryItem(db, 'component', name);
		if (item) await uninstall(db, item.id);
		else await deleteComponent(db, name); // legacy (old data without registry rows)
		return { ok: true, message: `元件「${name}」已刪除` };
	},

	/* * review shortcut (Phase 36): approve/send-to-review directly inside the Workshop */
	review: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const review = String(form.get('review') ?? '');
		if (review !== 'approved' && review !== 'pending')
			return fail(400, { message: 'review_invalid' });
		const item = await getRegistryItem(db, 'component', name);
		if (!item) return fail(404, { message: 'registry 查無此元件（舊資料請先重新儲存一次）' });
		const r = await setReview(db, item.id, review);
		return r.ok
			? {
					ok: true,
					message: review === 'approved' ? `「${name}」已批准並對外服務` : `「${name}」已送審`
				}
			: fail(400, { message: r.error });
	},

	toggle: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { message: '資料庫未配置' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const enabled = form.get('enabled') === 'on';
		const item = await getRegistryItem(db, 'component', name);
		if (item) await setEnabled(db, item.id, enabled);
		else await setComponentEnabled(db, name, enabled);
		return { ok: true, message: enabled ? '已啟用' : '已停用' };
	}
};
