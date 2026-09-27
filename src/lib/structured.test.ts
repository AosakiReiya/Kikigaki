import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	buildArticle,
	buildProduct,
	buildBook,
	buildBreadcrumb,
	buildItemList,
	buildWebSite,
	isoDate,
	ldScript,
	validateLdNode
} from './structured';
import { applySiteRuntime } from '$lib/site';

describe('isoDate（可空政策）', () => {
	it('日期字串 → ISO8601 UTC', () => {
		expect(isoDate('2026-08-10')).toBe('2026-08-10T00:00:00.000Z');
	});
	it('NULL/空/無效 → undefined（省略欄位不假造）', () => {
		expect(isoDate(null)).toBeUndefined();
		expect(isoDate('')).toBeUndefined();
		expect(isoDate('not-a-date')).toBeUndefined();
	});
});

describe('buildArticle', () => {
	beforeAll(() => applySiteRuntime({ siteUrl: 'https://example.com' }));
	afterAll(() => applySiteRuntime(null));
	const base = { title: 'T', description: 'D', images: [], url: 'https://example.com/blog/t' };
	it('預設 BlogPosting；schemaType 白名單外亦退回', () => {
		expect(buildArticle(base)['@type']).toBe('BlogPosting');
		expect(buildArticle({ ...base, schemaType: 'Hacked' })['@type']).toBe('BlogPosting');
		expect(buildArticle({ ...base, schemaType: 'NewsArticle' })['@type']).toBe('NewsArticle');
	});
	it('無效日期＝欄位缺席（非空字串/null）', () => {
		const a = buildArticle({ ...base, datePublished: '' });
		expect('datePublished' in a).toBe(false);
		expect('dateModified' in a).toBe(false);
	});
	it('dateModified 缺省跟随 datePublished', () => {
		const a = buildArticle({ ...base, datePublished: '2026-01-01' });
		expect(a.dateModified).toBe(a.datePublished);
	});
	it('images 去重＋相對轉絕對；空集合不發 image', () => {
		const a = buildArticle({ ...base, images: ['/a.png', 'https://example.com/a.png', null] });
		expect(a.image).toEqual(['https://example.com/a.png']);
		expect('image' in buildArticle(base)).toBe(false);
	});
	it('作者覆寫進 author.name；留空＝站主', () => {
		const a = buildArticle({ ...base, authorName: ' 外部作者 ' });
		expect((a.author as { name: string }).name).toBe('外部作者');
		expect((buildArticle(base).author as { name: string }).name.length).toBeGreaterThan(0);
	});
	it('系列 → isPartOf Book 數組', () => {
		const a = buildArticle({ ...base, series: [{ title: '書', slug: 'book-a' }] });
		expect((a.isPartOf as { '@type': string }[])[0]['@type']).toBe('Book');
	});
});

describe('buildBreadcrumb／buildWebSite／buildBook／ItemList', () => {
	it('麵包屑 position 由 1 連續', () => {
		const b = buildBreadcrumb([
			{ name: 'a', url: 'u1' },
			{ name: 'b', url: 'u2' },
			{ name: 'c', url: 'u3' }
		]);
		const items = b.itemListElement as { position: number }[];
		expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
	});
	it('WebSite 帶 SearchAction 模板', () => {
		const w = buildWebSite();
		const pa = w.potentialAction as { target: { urlTemplate: string }; 'query-input': string };
		expect(pa.target.urlTemplate).toContain('{search_term_string}');
		expect(pa['query-input']).toBe('required name=search_term_string');
	});
	it('Book hasPart 章節定位從 1；封面可選', () => {
		const bk = buildBook({ title: 'B', summary: 'S', slug: 'b' }, [{ title: 'c1', slug: 'c1' }]);
		expect((bk.hasPart as { position: number }[])[0].position).toBe(1);
		expect('image' in bk).toBe(false);
		const bk2 = buildBook({ title: 'B', summary: 'S', slug: 'b', cover: '/x.png' }, []);
		expect(bk2.image as string).toContain('/x.png');
	});
	it('ItemList 計數與 item 巢狀', () => {
		const l = buildItemList('N', [{ title: 'a', slug: 'a' }]);
		const me = l.mainEntity as {
			numberOfItems: number;
			itemListElement: { item: { '@type': string } }[];
		};
		expect(me.numberOfItems).toBe(1);
		expect(me.itemListElement[0].item['@type']).toBe('Book');
	});
});

describe('ldScript／validateLdNode', () => {
	it('< 轉義防 script 早關', () => {
		const j = ldScript(buildArticle({ title: 'a<b', description: 'd', images: [], url: 'u' }));
		expect(j).not.toContain('<');
	});
	it('Article 必填/選填分級', () => {
		const checks = validateLdNode(
			buildArticle({ title: 'T', description: 'D', images: [], url: 'u' })
		);
		expect(checks.find((c) => c.label === 'headline')?.ok).toBe(true);
		expect(checks.find((c) => c.label.startsWith('image'))?.ok).toBe(false);
		expect(checks.find((c) => c.label.startsWith('image'))?.level).toBe('warn');
	});
	it('壞 JSON 由呼叫端標 error', () => {
		const checks = validateLdNode({ '@context': 'wrong', '@type': 'Thing' });
		expect(checks.find((c) => c.label.includes('context'))?.ok).toBe(false);
	});

	describe('84 buildProduct', () => {
		it('Product + Offer with uppercased currency and image absolutized', () => {
			const node = buildProduct({
				name: 'E-Book Guide',
				description: 'from zero to live',
				image: '/media/cover.png',
				url: '/products/kikigaki-ebook',
				price: '12.00',
				currency: 'usd'
			});
			expect(node['@type']).toBe('Product');
			expect(node.name).toBe('E-Book Guide');
			const offers = node.offers as Record<string, unknown>;
			expect(offers.price).toBe('12.00');
			expect(offers.priceCurrency).toBe('USD');
			expect(String(node.image)).toMatch(/^https?:/);
		});
		it('omits empty description/image gracefully', () => {
			const node = buildProduct({ name: 'x', url: '/products/x', price: '9.00', currency: 'twd' });
			expect(node.description).toBeUndefined();
			expect((node.offers as Record<string, unknown>).priceCurrency).toBe('TWD');
		});
	});
});
