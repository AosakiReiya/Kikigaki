import { describe, expect, it } from 'vitest';
import { baseOf, needsSync, planSync, type Catalog } from './i18n-config';

const catalog: Catalog = {
	'zh-tw': { label: '繁體中文', hreflang: 'zh-Hant', bcp47: 'zh-Hant-TW', base: true },
	en: { label: 'English', hreflang: 'en', bcp47: 'en-US' },
	jp: { label: '日本語', hreflang: 'ja', bcp47: 'ja-JP' }
};
const messages = ['zh-tw', 'en', 'jp'];

describe('planSync', () => {
	it('合法子集：母語恆排第一', () => {
		const p = planSync(catalog, ['en', 'jp'], messages);
		expect(p.errors).toEqual([]);
		expect(p.locales).toEqual(['zh-tw', 'en', 'jp']);
	});
	it('缺母語→自動補入＋提示', () => {
		const p = planSync(catalog, ['en'], messages);
		expect(p.locales[0]).toBe('zh-tw');
		expect(p.notes[0]).toContain('自動補入');
	});
	it('未知 code／缺字典檔→錯誤', () => {
		const p = planSync(catalog, ['zh-tw', 'de'], messages);
		expect(p.errors.length).toBe(2);
		expect(p.errors.join()).toContain('i18n:add');
	});
	it('重複去重', () => {
		const p = planSync(catalog, ['en', 'en', 'zh-tw'], messages);
		expect(p.locales).toEqual(['zh-tw', 'en']);
	});
	it('空白/空字串容忍', () => {
		const p = planSync(catalog, [' zh-tw ', '', 'en'], messages);
		expect(p.locales).toEqual(['zh-tw', 'en']);
	});
});

describe('baseOf／needsSync', () => {
	it('無 base 標記時首 key 為母語', () => {
		expect(baseOf({ en: { label: 'E', hreflang: 'en', bcp47: 'en' } })).toBe('en');
	});
	it('locales 或 baseLocale 漂移皆觸發', () => {
		const plan = planSync(catalog, ['en'], messages);
		expect(needsSync({ locales: plan.locales, baseLocale: plan.base }, plan)).toBe(false);
		expect(needsSync({ locales: ['en', 'zh-tw'], baseLocale: plan.base }, plan)).toBe(true);
		expect(needsSync({ locales: plan.locales, baseLocale: 'en' }, plan)).toBe(true);
	});
});
