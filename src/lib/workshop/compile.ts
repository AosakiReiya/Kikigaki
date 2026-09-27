/**
 * Workshop compile layer — compiles .svelte source into mountable components in the browser.
 *
 * How: svelte/compiler (dynamic import, loaded only on Workshop/custom-component pages) outputs like
 *   import 'svelte/internal/disclose-version';
 *   import * as $ from 'svelte/internal/client';
 *   export default function X($$anchor, $$props) {…}
 * Namespace imports are rewritten to function-parameter injection (the app's svelte runtime is the same instance →
 * versions inherently match, zero CDN); export default becomes a return. CSS is a separate string injected
 * as <style data-cc-name> at mount.
 *
 * Security boundary (v1): Workshop and post custom components both run in the main window (single-admin author domain,
 * equivalent to pasting code in console). Third-party/marketplace distribution MUST switch to the Phase 15 cc/1 iframe sandbox route.
 */
// Workshop design cornerstone: inject the same client runtime instance into compiled output (not normal component usage; deliberately bypasses no-svelte-internal)
// eslint-disable-next-line svelte/no-svelte-internal
import * as clientRuntime from 'svelte/internal/client';
import type { Component } from 'svelte';

export interface CompileOutcome {
	ok: boolean;
	component?: Component;
	/** transformed module body (pre-instantiate); cacheable artifact for repeat visits */
	body?: string;
	css?: string;
	warnings?: string[];
	error?: string;
}

/**
 * ESM → function-body transform (pure string ops, unit-testable).
 * Returns the transformed body (final return of the default export); unsupported import shapes return null (callers error).
 */
export function transformCompiledModule(
	js: string
): { body: string; ns: string } | { error: string } {
	let code = js;

	// 1) strip side-effect imports (disclose-version etc.)
	code = code.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

	// 2) namespace import → parameter reference
	const nsMatch = code.match(
		/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]svelte\/internal\/client['"];?/
	);
	if (!nsMatch) {
		// 具名 import 形態也支援（未來編譯器格式變化時）
		const named = code.match(/import\s*\{[^}]*\}\s*from\s*['"]svelte\/internal\/client['"];?/);
		if (named)
			return { error: 'unsupported_import_shape（具名 client import，請用 namespace 版編譯器）' };
		return { error: 'no_client_import（編譯產物與預期不符）' };
	}
	const ns = nsMatch[1];
	code = code.replace(nsMatch[0], `/* ns injected as ${ns} */`);

	// 3) 殘留的其他模組 import → 拒絕（自訂元件不給 import 外部模組）
	const leftovers = code.match(/^\s*import\s+.*from\s*['"][^'"]+['"];?/gm);
	if (leftovers?.length)
		return { error: `no_external_imports（${leftovers[0].trim().slice(0, 60)}）` };

	// 4) export default → 回傳
	const defMatch = code.match(/export\s+default\s+/);
	if (!defMatch) return { error: 'no_default_export（元件需有 default export）' };
	code = code.replace(defMatch[0], 'const __cc_default = ');
	// `export default function X(` 經上述替換成 `const __cc_default = function X(` ✓ 表達式合法
	code = `${code}\n;return __cc_default;`;

	return { body: `const ${ns} = __cc_runtime;\n${code}`, ns };
}

/** 注入應用的 svelte client runtime 並实例化元件 */
export function instantiate(body: string): Component {
	const factory = new Function('__cc_runtime', body) as (rt: unknown) => Component;
	return factory(clientRuntime);
}

/** 元件 CSS 注入（同 name 覆蓋 → 元件更新後樣式跟隨；文章頁與 Workshop 共用） */
export function injectCss(name: string, css: string): void {
	if (!css) return;
	let el = document.head.querySelector<HTMLStyleElement>(`style[data-cc-style="${name}"]`);
	if (!el) {
		el = document.createElement('style');
		el.setAttribute('data-cc-style', name);
		document.head.appendChild(el);
	}
	el.textContent = css;
}

/** 完整編譯流程（編譯器 chunk 首次使用時才載入） */
let compilerPromise: Promise<typeof import('svelte/compiler')> | undefined;
function compiler() {
	return (compilerPromise ??= import('svelte/compiler'));
}

export async function compileComponentSource(
	name: string,
	source: string
): Promise<CompileOutcome> {
	let compiled;
	try {
		const { compile } = await compiler();
		compiled = compile(source, { generate: 'client', dev: false, filename: `${name}.svelte` });
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message.split('\n')[0] : 'compile_failed' };
	}
	const t = transformCompiledModule(compiled.js.code);
	if ('error' in t) return { ok: false, error: t.error };
	try {
		const component = instantiate(t.body);
		return {
			ok: true,
			component,
			body: t.body,
			css: compiled.css?.code ?? '',
			warnings: (compiled.warnings ?? []).map((w) => String(w.code ?? w.message ?? w))
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'instantiate_failed' };
	}
}
