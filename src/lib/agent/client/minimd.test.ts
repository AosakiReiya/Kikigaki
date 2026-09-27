import { describe, it, expect } from 'vitest';
import { miniMd } from './minimd';

describe('miniMd', () => {
	it('escape HTML（XSS 安全）', () => {
		expect(miniMd('<img src=x onerror=alert(1)>')).not.toContain('<img');
		expect(miniMd('<script>alert(1)</script>')).not.toContain('<script>');
	});
	it('javascript: 連結不成 anchor', () => {
		const out = miniMd('[x](javascript:alert(1))');
		expect(out).not.toContain('<a ');
	});
	it('http 連結成 anchor + noopener', () => {
		const out = miniMd('[docs](https://example.com/a)');
		expect(out).toContain('<a href="https://example.com/a"');
		expect(out).toContain('rel="noopener noreferrer"');
	});
	it('行內碼／粗體／斜體', () => {
		expect(miniMd('`code`')).toContain('<code>code</code>');
		expect(miniMd('**b** and *i*')).toContain('<strong>b</strong>');
		expect(miniMd('**b** and *i*')).toContain('<em>i</em>');
	});
	it('程式碼塊保留換行', () => {
		const out = miniMd('```\nline1\nline2\n```');
		expect(out).toContain('<pre class="mm-code"><code>line1\nline2</code></pre>');
	});
	it('未閉合 code 塊仍輸出', () => {
		expect(miniMd('```\na')).toContain('a');
	});
	it('清單成組', () => {
		const out = miniMd('- a\n- b');
		expect(out).toContain('<ul class="mm-ul"><li>a</li><li>b</li></ul>');
	});
	it('空行轉 br、純文字成 p', () => {
		const out = miniMd('hello\n\nworld');
		expect(out).toContain('<p class="mm-p">hello</p>');
		expect(out).toContain('<br/>');
	});
	it('分隔線', () => {
		expect(miniMd('---')).toContain('<hr class="mm-hr"/>');
	});
	it('空字串安全', () => {
		expect(miniMd('')).toBe('');
	});
});
