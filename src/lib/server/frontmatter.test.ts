import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseFrontmatter } from './frontmatter';

describe('YAML frontmatter import', () => {
	it('preserves metadata and body with CRLF, Unicode, lists and dates', () => {
		expect(
			parseFrontmatter(
				'---\r\ntitle: 遊戲\r\ndate: 2026-10-10\r\ntags: [AI, Repo]\r\n---\r\n# Body\r\n'
			)
		).toEqual({
			data: { title: '遊戲', date: '2026-10-10', tags: ['AI', 'Repo'] },
			content: '# Body\n'
		});
	});
	it('keeps plain markdown unchanged and rejects executable or invalid metadata', () => {
		expect(parseFrontmatter('# Title\n')).toEqual({ data: {}, content: '# Title\n' });
		expect(() => parseFrontmatter('---\n- one\n---\n')).toThrow('mapping');
		expect(() => parseFrontmatter('---\nfn: !!js/function function() {}\n---\n')).toThrow();
	});
	it('parses every existing article with a title and preserves its markdown body', () => {
		const files = readdirSync('content/blog').filter((file) => file.endsWith('.md'));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const parsed = parseFrontmatter(readFileSync(`content/blog/${file}`, 'utf8'));
			expect(typeof parsed.data.title, file).toBe('string');
			expect(parsed.content.length, file).toBeGreaterThan(0);
		}
	});
});
