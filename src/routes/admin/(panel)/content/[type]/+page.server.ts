import { error, fail } from '@sveltejs/kit';
import { deleteItem, getType, listItems, parseFields, upsertItem } from '$lib/server/content-items';
import type { ContentTypeField } from '$lib/server/content-types/types';
import type { Actions, PageServerLoad } from './$types';

const PAGE = 20;

export const load: PageServerLoad = async ({ platform, params, url }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	const type = await getType(db, params.type);
	if (!type) error(404, '找不到此內容型別');
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { fields } = parseFields(type.fieldsRaw);
	const { items, total } = await listItems(db, params.type, {
		limit: PAGE,
		offset: (page - 1) * PAGE
	});
	return {
		typeKey: type.key,
		label: type.label,
		titleField: type.titleField,
		fields,
		items,
		total,
		page,
		pages: Math.max(1, Math.ceil(total / PAGE))
	};
};

/* * form values → data object (f_<key> convention; boolean presence = true; repeater multi-values drop empty strings) */
function collect(fd: FormData, fields: ContentTypeField[]): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const f of fields) {
		const key = `f_${f.key}`;
		if (f.kind === 'boolean') data[f.key] = fd.has(key);
		else if (f.kind === 'repeater') {
			const vs = fd
				.getAll(key)
				.map(String)
				.filter((v) => v.trim() !== '');
			if (vs.length) data[f.key] = vs;
		} else {
			const v = fd.get(key);
			if (v !== null && v !== '') data[f.key] = String(v);
		}
	}
	return data;
}

export const actions: Actions = {
	save: async ({ platform, request, params }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { errors: ['資料庫未配置'] });
		const type = await getType(db, params.type);
		if (!type) return fail(404, { errors: ['型別不存在'] });
		const { fields } = parseFields(type.fieldsRaw);
		const fd = await request.formData();
		const raw = collect(fd, fields);
		const id = String(fd.get('id') ?? '');
		const slug = String(fd.get('slug') ?? '') || slugFrom(String(raw[type.titleField] ?? ''), id);
		const published = fd.get('published') !== null;
		const sortOrder = Number(fd.get('sortOrder') ?? 0) || 0;
		const res = await upsertItem(db, params.type, {
			id: id || undefined,
			slug,
			dataJson: JSON.stringify(raw),
			published,
			sortOrder
		});
		if (!res.ok) return fail(400, { errors: res.errors });
		return { ok: true, slug: res.slug };
	},
	delete: async ({ platform, request }) => {
		const db = platform?.env.DB;
		if (!db) return fail(500, { errors: ['資料庫未配置'] });
		const fd = await request.formData();
		await deleteItem(db, String(fd.get('id') ?? ''));
		return { ok: true };
	}
};

function slugFrom(title: string, fallback: string): string {
	const s = title
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
		.replace(/[^a-z0-9\p{Script=Han}-]/gu, '');
	return s || `item-${fallback ? fallback.slice(0, 8) : Date.now().toString(36)}`;
}
