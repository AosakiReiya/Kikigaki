import { describe, expect, it } from 'vitest';
import { TOOLS } from './tools';

describe('content-type agent tools (phase 79c)', () => {
	const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

	it('四支註冊、風險分級正確（寫入全 high，發現類 read/low）', () => {
		expect(byName['list_content_types'].permission).toBe('read');
		expect(byName['list_content_types'].risk).toBe('low');
		for (const n of ['create_content_type', 'update_content_type', 'delete_content_type']) {
			expect(byName[n].permission, n).toBe('write');
			expect(byName[n].risk, n).toBe('high');
		}
	});

	it('create/delete 對非法 key 在觸 DB 前拒絕（fakeDb 安全）', async () => {
		const ctx = { db: {} as never, runId: 't', sessionId: 't' };
		expect(
			await byName['create_content_type'].run(ctx, { key: 'Bad Key', label: 'x', fields: '[]' })
		).toEqual({
			ok: false,
			error: expect.stringContaining('key')
		});
		expect(await byName['delete_content_type'].run(ctx, { key: 'a' })).toEqual({
			ok: false,
			error: 'key 非法'
		});
	});

	it('create 的 description 教 agent 驗證器語意（錯誤清單返還、不硬試）', () => {
		expect(byName['create_content_type'].description).toContain('錯誤清單');
		expect(byName['create_content_type'].description).toContain('markdown');
	});

	it('agent 模式曝光含四支新工具（visibleTools 過濾面）', async () => {
		const { visibleTools } = await import('./tools');
		const names = visibleTools('agent').map((t) => t.name);
		for (const n of [
			'list_content_types',
			'create_content_type',
			'update_content_type',
			'delete_content_type'
		])
			expect(names, n).toContain(n);
	});
});
