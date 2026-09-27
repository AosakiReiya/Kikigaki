/**
 * Custom-component client registry — name → compiled component (Promise cache; avoids repeat fetch/compile).
 * Source: /api/components/code (enabled only). Compile failure / missing → null (placeholder stays empty, logged).
 */
import type { Component } from 'svelte';
import { compileComponentSource, injectCss } from './compile';

const cache = new Map<string, Promise<Component | null>>();

export function getCustomComponent(name: string): Promise<Component | null> | null {
	return cache.get(name) ?? null;
}

export function ensureCustomComponent(name: string): Promise<Component | null> {
	let p = cache.get(name);
	if (!p) {
		p = load(name);
		cache.set(name, p);
	}
	return p;
}

async function load(name: string): Promise<Component | null> {
	try {
		const res = await fetch(`/api/components/code?name=${encodeURIComponent(name)}`);
		if (!res.ok) return null;
		const { code } = (await res.json()) as { code?: string };
		if (!code) return null;
		const out = await compileComponentSource(name, code);
		if (!out.ok || !out.component) {
			console.warn(`[cc] 自訂元件 ${name} 編譯失敗：${out.error}`);
			return null;
		}
		if (out.css) injectCss(name, out.css);
		return out.component;
	} catch {
		return null;
	}
}

/** refresh one cache entry after a Workshop save (next mount uses the new version)*/
export function invalidateCustomComponent(name: string): void {
	cache.delete(name);
}
