import { describe, expect, it } from 'vitest';
import { TOOLS } from './tools';
import { buildSystemPrompt } from './runtime/engine';

describe('DB theme agent tools (phase 78c c3)', () => {
	it('五個工具註冊且權限/風險正確（寫入全 high；內建切換維持 low）', () => {
		const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
		expect(byName['list_db_themes'].permission).toBe('read');
		expect(byName['get_db_theme'].permission).toBe('read');
		expect(byName['save_db_theme'].risk).toBe('high');
		expect(byName['delete_db_theme'].risk).toBe('high');
		expect(byName['apply_db_theme'].risk).toBe('high');
		expect(byName['set_ui_theme'].risk).toBe('low');
	});
	it('apply/save/delete 守 db- 前綴（內建 id 拒入）', async () => {
		const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
		const fakeDb = {} as never;
		const ctx = { db: fakeDb, runId: 't', sessionId: 't' };
		expect(await byName['apply_db_theme'].run(ctx, { id: 'terminal' })).toEqual({
			ok: false,
			error: 'need_db_prefixed_id'
		});
		expect(await byName['delete_db_theme'].run(ctx, { id: 'abstract' })).toEqual({
			ok: false,
			error: 'need_db_prefixed_id'
		});
		expect(
			await byName['save_db_theme'].run(ctx, { slug: 'AB', label: 'x', surfaces: '{}' })
		).toEqual({ ok: false, error: '需要合法 id 或新建 slug' });
	});
	it('save_db_theme surfaces 非法 JSON＝拒', async () => {
		const t = TOOLS.find((x) => x.name === 'save_db_theme')!;
		const r = await t.run(
			{ db: {} as never, runId: 't', sessionId: 't' },
			{
				id: 'db-xyz',
				label: 'L',
				surfaces: '{bad'
			}
		);
		expect(r).toEqual({ ok: false, error: 'surfaces 需為合法 JSON 物件' });
	});
	it('save_db_theme 靜態安全檢攔危險碼（過 getTheme 前）', async () => {
		const t = TOOLS.find((x) => x.name === 'save_db_theme')!;
		let dbTouched = false;
		const guard = new Proxy(
			{},
			{
				get() {
					dbTouched = true;
					throw new Error('must not reach db');
				}
			}
		);
		const r = await t.run(
			{ db: guard as never, runId: 't', sessionId: 't' },
			{ id: 'db-xyz', label: 'L', surfaces: JSON.stringify({ Home: { code: 'eval("1")' } }) }
		);
		expect(r.ok).toBe(false);
		expect((r as { issues?: string[] }).issues?.length).toBeGreaterThan(0);
		expect(dbTouched).toBe(false);
	});
});

describe('themeEditing 上下文序列化（78c）', () => {
	const ctx = {
		route: '/admin/themes',
		themeEditing: {
			id: 'db-neon',
			label: 'Neon',
			base: 'terminal',
			version: 2,
			tokens: ':root{--a:1}',
			surfaces: { Home: { code: '<h1>HI</h1>' } },
			dirty: true
		}
	};
	it('注入主題身份＋槽位碼＋工具指引', () => {
		const p = buildSystemPrompt('agent', ctx);
		expect(p).toContain('正在編輯 DB 主題：Neon（id=db-neon，base=terminal');
		expect(p).toContain('未儲存草稿');
		expect(p).toContain('<h1>HI</h1>');
		expect(p).toContain('save_db_theme');
		expect(p).toContain(':root{--a:1}');
	});
	it('無 themeEditing 不注入', () => {
		expect(buildSystemPrompt('agent', { route: '/admin' })).not.toContain('正在編輯 DB 主題');
	});
});
