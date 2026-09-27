/** 79b validator contract — the dynamic form is convenience; this is the law. */
import { describe, expect, it } from 'vitest';
import { isReservedTypeKey, normalizeSlug, parseFields, validateData } from './content-items';
import type { ContentTypeField } from './content-types/types';

const f = (
	over: Partial<ContentTypeField> & { key: string; kind: ContentTypeField['kind'] }
): ContentTypeField => ({
	...over
});

describe('parseFields', () => {
	it('accepts a clean manifest, normalising unknown extras', () => {
		const { fields, errors } = parseFields(
			JSON.stringify([
				{ key: 'title', kind: 'text', required: true, max: 80 },
				{ key: 'body', kind: 'markdown' },
				{ key: 'cover', kind: 'media' },
				{ key: 'public', kind: 'boolean' },
				{ key: 'day', kind: 'date' },
				{ key: 'tier', kind: 'select', options: ['a', 'b', 3] },
				{ key: 'tags', kind: 'repeater' }
			])
		);
		expect(errors).toEqual([]);
		expect(fields).toHaveLength(7);
		expect(fields[5].options).toEqual(['a', 'b']); // non-strings dropped
	});
	it('rejects unknown kinds / dup keys / bad key shape, keeps valid rows', () => {
		const { fields, errors } = parseFields(
			JSON.stringify([
				{ key: 'ok', kind: 'text' },
				{ key: 'ok', kind: 'text' },
				{ key: 'BAD KEY', kind: 'text' },
				{ key: 'weird', kind: 'laser' }
			])
		);
		expect(fields.map((x) => x.key)).toEqual(['ok']);
		expect(errors.length).toBe(3);
	});
	it('survives garbage without throwing', () => {
		expect(parseFields('{oops').errors.length).toBe(1);
		expect(parseFields('"a string"').errors.length).toBe(1);
		expect(
			parseFields('[' + '{"key":"x","kind":"text"},'.repeat(3000) + ']'.padEnd(40000, ' ')).errors
				.length
		).toBeGreaterThan(0);
	});
});

describe('validateData', () => {
	const fields = [
		f({ key: 'title', kind: 'text', required: true, max: 10 }),
		f({ key: 'body', kind: 'markdown', required: true }),
		f({ key: 'cover', kind: 'media' }),
		f({ key: 'flag', kind: 'boolean' }),
		f({ key: 'day', kind: 'date' }),
		f({ key: 'tier', kind: 'select', options: ['pro', 'max'] }),
		f({ key: 'tags', kind: 'repeater' })
	];
	it('passes a good payload', () => {
		expect(
			validateData(fields, {
				title: 'T',
				body: 'b',
				cover: '/m/a.png',
				flag: true,
				day: '2026-09-14',
				tier: 'pro',
				tags: ['x']
			})
		).toEqual([]);
	});
	it('required + unknown keys + type rules all surface', () => {
		const errs = validateData(fields, {
			body: 42,
			cover: 'javascript:alert(1)',
			flag: 'yes',
			day: 'nope',
			tier: 'gold',
			tags: 'x',
			extra: 1
		} as Record<string, unknown>);
		expect(errs.some((e) => e.includes('title：必填'))).toBe(true);
		expect(errs.some((e) => e.includes('未知欄位：extra'))).toBe(true);
		expect(errs.some((e) => e.includes('body：需字串'))).toBe(true);
		expect(errs.some((e) => e.includes('cover'))).toBe(true);
		expect(errs.some((e) => e.includes('flag：需布林'))).toBe(true);
		expect(errs.some((e) => e.includes('day：需 ISO 日期'))).toBe(true);
		expect(errs.some((e) => e.includes('tier：不在選項內'))).toBe(true);
	});
	it('respects max on text/markdown and repeater bounds', () => {
		expect(validateData(fields, { title: 'x'.repeat(11), body: 'b' })).toContain(
			'title：超過 10 字'
		);
		expect(
			validateData([{ key: 't', kind: 'repeater' }], {
				t: Array.from({ length: 51 }, (_, i) => `i${i}`)
			}).length
		).toBe(1);
	});
});

describe('normalizeSlug', () => {
	it('accepts ascii + CJK, lowercases, dashes spaces', () => {
		expect(normalizeSlug('My Post')).toBe('my-post');
		expect(normalizeSlug('夢-信')).toBe('夢-信');
		expect(normalizeSlug('A_b1')).toBe('a_b1');
	});
	it('rejects path chars, empty, overlong, bad first char', () => {
		expect(normalizeSlug('a/b')).toBeNull();
		expect(normalizeSlug('')).toBeNull();
		expect(normalizeSlug('x'.repeat(61))).toBeNull();
		expect(normalizeSlug('_lead')).toBeNull();
	});
});

describe('isReservedTypeKey (79d)', () => {
	it('內建鍵/路由段/語系前綴全拒', () => {
		for (const k of [
			'posts',
			'pages',
			'series',
			'blog',
			'search',
			'about',
			'admin',
			'api',
			'tags',
			'en',
			'jp',
			'zh-cn',
			'zh-tw',
			'services',
			'contact',
			'sitemap.xml'
		])
			expect(isReservedTypeKey(k), k).toBe(true);
	});
	it('正常業務 key 放行', () => {
		for (const k of ['portfolio', 'recipes', 'talks', 'guest-book'])
			expect(isReservedTypeKey(k), k).toBe(false);
	});
});
