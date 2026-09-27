import { error } from '@sveltejs/kit';
import { getItem, getType, parseFields } from '$lib/server/content-items';
import { renderMarkdown } from '$lib/markdown';
import { buildBreadcrumb, buildProduct, ldScript } from '$lib/structured';
import { resolveCurrency } from '$lib/server/commerce';
import type { CommerceEnv } from '$lib/server/commerce/types';
import type { PageServerLoad } from './$types';

/* * 79d: dynamic-type entry detail /key/slug (published only; markdown fields server-prerendered) */
export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, '資料庫未配置');
	const type = await getType(db, params.slug);
	if (!type?.enabled) error(404, '找不到此內容');
	const item = await getItem(db, type.key, params.item);
	if (!item || !item.published) error(404, '找不到此條目');
	const { fields } = parseFields(type.fieldsRaw);

	const html: Record<string, string> = {};
	for (const f of fields) {
		const v = item.data[f.key];
		if (f.kind === 'markdown' && typeof v === 'string' && v.trim())
			html[f.key] = renderMarkdown(v).html;
	}
	const titleVal = item.data[type.titleField];
	const title = typeof titleVal === 'string' && titleVal ? titleVal : item.slug;
	// SEO description: first non-empty text/markdown field truncated to 160; thumbnail = first media field
	let description = '';
	let image: string | undefined;
	for (const f of fields) {
		const v = item.data[f.key];
		if (
			!description &&
			typeof v === 'string' &&
			v.trim() &&
			(f.kind === 'text' || f.kind === 'markdown')
		)
			description = v
				.replace(/[#*_>`\n]/g, ' ')
				.trim()
				.slice(0, 160);
		if (!image && f.kind === 'media' && typeof v === 'string' && v) image = v;
	}

	// 79e 商品偵測：products 契約欄位齊備（price＋goods/ 檔）即掛買單列——
	// 商店性来自資料，不来自 pack；shop pack 只升級陳列語言。
	const priceStr = typeof item.data.price === 'string' ? item.data.price.trim() : '';
	const fileStr = typeof item.data.file === 'string' ? item.data.file : '';
	const buy =
		/^(0\.)?[0-9]{1,6}(\.[0-9]{2})?$/.test(priceStr) && fileStr.startsWith('goods/')
			? { price: priceStr }
			: null;

	// 84：商品契約成立時輸出 Product＋Offer＋面包屑結構化資料
	let ldNodes: string[] | undefined;
	if (buy) {
		const currency = await resolveCurrency(db, platform?.env as unknown as CommerceEnv);
		const url = `/${type.key}/${item.slug}`;
		ldNodes = [
			buildProduct({
				name: title,
				description,
				image,
				url,
				price: buy.price,
				currency
			}),
			buildBreadcrumb([
				{ name: 'Home', url: '/' },
				{ name: type.label, url: `/${type.key}` },
				{ name: title, url }
			])
		].map(ldScript);
	}

	return {
		genericItem: {
			typeKey: type.key,
			typeLabel: type.label,
			titleField: type.titleField,
			fields,
			item,
			html,
			buy
		},
		...(ldNodes ? { ldNodes } : {}),
		meta: {
			title,
			description,
			path: `/${type.key}/${item.slug}`,
			...(image ? { image } : {}),
			type: 'article' as const
		}
	};
};
