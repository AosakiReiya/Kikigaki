import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './engine';

describe('emailTemplate 上下文序列化（Phase 71）', () => {
	const ctx = {
		route: '/admin/email-templates',
		emailTemplate: {
			slug: 'welcome',
			name: '歡迎信',
			type: 'welcome',
			version: 2,
			subject: '歡迎 {{site.name}}',
			source: '<Email><Hero title="X" /></Email>',
			dirty: true
		}
	};
	it('注入範本身份＋源碼＋工具指引', () => {
		const p = buildSystemPrompt('agent', ctx);
		expect(p).toContain('正在編輯郵件範本：歡迎信（slug=welcome');
		expect(p).toContain('未儲存草稿');
		expect(p).toContain('<Email><Hero title="X" /></Email>');
		expect(p).toContain('save_email_template_version');
		expect(p).toContain('主旨草稿：歡迎 {{site.name}}');
	});
	it('無草稿時不宣稱髒', () => {
		const p = buildSystemPrompt('agent', {
			...ctx,
			emailTemplate: { ...ctx.emailTemplate, dirty: false }
		});
		expect(p).not.toContain('未儲存草稿');
	});
	it('未選範本＝零殘留', () => {
		const p = buildSystemPrompt('agent', { route: '/admin' });
		expect(p).not.toContain('郵件範本');
	});
});
