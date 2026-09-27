import { describe, expect, it } from 'vitest';
import { TOOLS } from './tools';

describe('email template agent tools (phase 67b)', () => {
	it('五個工具註冊且權限/風險正確', () => {
		const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
		expect(byName['list_email_templates'].permission).toBe('read');
		expect(byName['get_email_template'].permission).toBe('read');
		expect(byName['save_email_template_version'].permission).toBe('write');
		expect(byName['save_email_template_version'].risk).toBe('high');
		expect(byName['activate_email_template_version'].risk).toBe('high');
		expect(byName['send_test_email'].permission).toBe('publish');
		expect(byName['send_test_email'].risk).toBe('medium');
	});
	it('每個工具都有 summary 或 run 實作', () => {
		for (const n of [
			'list_email_templates',
			'get_email_template',
			'save_email_template_version',
			'activate_email_template_version',
			'send_test_email'
		]) {
			const t = TOOLS.find((x) => x.name === n);
			expect(t, n).toBeDefined();
			expect(typeof t?.run, n).toBe('function');
		}
	});
});

describe('newsletter agent tools (phase 72)', () => {
	it('註冊且權限正確', () => {
		const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
		expect(byName['list_subscribers'].permission).toBe('read');
		expect(byName['send_newsletter'].permission).toBe('publish');
		expect(byName['send_newsletter'].risk).toBe('high');
	});
});
