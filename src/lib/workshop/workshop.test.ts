import { describe, it, expect } from 'vitest';
import { transformCompiledModule } from './compile';
import { validateComponentFields } from '$lib/server/components';
import { extractSvelteCode } from '$lib/server/components';

describe('transformCompiledModule', () => {
	it('rewrites namespace import + default export', () => {
		const js = [
			`import 'svelte/internal/disclose-version';`,
			`import * as $ from 'svelte/internal/client';`,
			`export default function Demo($$anchor) { $.noop(); }`
		].join('\n');
		const t = transformCompiledModule(js);
		expect('body' in t).toBe(true);
		if ('body' in t) {
			expect(t.body).toContain('const $ = __cc_runtime;');
			expect(t.body).toContain('const __cc_default = function Demo');
			expect(t.body).toContain('return __cc_default;');
			expect(t.body).not.toMatch(/^\s*import\s/m);
		}
	});

	it('rejects leftover external imports', () => {
		const js = [
			`import * as $ from 'svelte/internal/client';`,
			`import { fly } from 'svelte/transition';`,
			`export default function X($) {}`
		].join('\n');
		const t = transformCompiledModule(js);
		expect('error' in t && t.error).toContain('no_external_imports');
	});

	it('rejects missing default export', () => {
		const js = `import * as $ from 'svelte/internal/client';\nconst a = 1;`;
		const t = transformCompiledModule(js);
		expect('error' in t && t.error).toContain('no_default_export');
	});
});

describe('validateComponentFields', () => {
	it('accepts valid names & rejects bad', () => {
		expect(validateComponentFields({ name: 'my-widget-2', code: '<x></x>' })).toBeNull();
		expect(validateComponentFields({ name: 'A', code: 'x' })).toContain('name_invalid');
		expect(validateComponentFields({ name: 'callout', code: 'x' })).toContain('name_reserved');
		expect(validateComponentFields({ name: 'ok-name', code: '  ' })).toContain('code_required');
		expect(
			validateComponentFields({ name: 'ok-name', code: '<script src="evil.js"></scr' + 'ipt>' })
		).toContain('no_script_src');
	});
});

describe('extractSvelteCode', () => {
	it('prefers fenced block', () => {
		const reply = '好\n```svelte\n<' + 'script>x</scr' + 'ipt><div>y</div>\n```\n完';
		expect(extractSvelteCode(reply)).toContain('<div>y</div>');
	});
	it('accepts raw component-looking reply', () => {
		expect(extractSvelteCode('<p>hello</p>')).toBe('<p>hello</p>');
	});
	it('rejects prose replies', () => {
		expect(extractSvelteCode('抱歉，我無法完成')).toBeNull();
	});
});
