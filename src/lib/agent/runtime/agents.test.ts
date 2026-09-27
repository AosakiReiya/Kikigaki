import { describe, it, expect } from 'vitest';
import { ceilingAllows, environmentBlock } from './agents';

describe('ceilingAllows（Phase 32 風險上限）', () => {
	it('read 上限只放行 read', () => {
		expect(ceilingAllows('read', 'read')).toBe(true);
		expect(ceilingAllows('read', 'low')).toBe(false);
		expect(ceilingAllows('read', 'critical')).toBe(false);
	});
	it('critical 放行全部合法風險', () => {
		for (const r of ['read', 'low', 'medium', 'high', 'critical'] as const)
			expect(ceilingAllows('critical', r)).toBe(true);
	});
	it('未知風險值一律拒絕（安全預設）', () => {
		expect(ceilingAllows('critical', 'godmode' as never)).toBe(false);
		expect(ceilingAllows('weird' as never, 'read')).toBe(false);
	});
	it('medium 上限：high/critical 擋下', () => {
		expect(ceilingAllows('medium', 'medium')).toBe(true);
		expect(ceilingAllows('medium', 'high')).toBe(false);
	});
});

describe('environmentBlock', () => {
	it('含日期與 route/locale', () => {
		const b = environmentBlock({ route: '/admin/posts', locale: 'zh-tw' }, '繁體中文');
		expect(b).toContain(new Date().toISOString().slice(0, 10));
		expect(b).toContain('目前頁面 route：/admin/posts');
		expect(b).toContain('介面語系：繁體中文');
	});
	it('空 context 仍有日期行', () => {
		expect(environmentBlock({})).toMatch(/^日期：\d{4}-\d{2}-\d{2}/);
	});
});
