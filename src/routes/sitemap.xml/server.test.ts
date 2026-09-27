/**
 * 79a smoke: the sitemap route handler must work end-to-end with NO database
 * (fresh-deploy state before cf:setup/seed) and emit registry-driven entries
 * in the historical order: / → listPaths(/blog,/series) → /about → (no data)
 * → (no tags). Real-data byte-compat is covered by the archived p61 e2e.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { applySiteRuntime } from '$lib/site';
import { GET } from './+server';

describe('sitemap GET without database', () => {
	beforeAll(() => {
		applySiteRuntime({ siteUrl: 'https://example.com' });
	});

	it('renders the static skeleton in registry contract order', async () => {
		const res = await GET({ platform: undefined } as never);
		expect(res.headers.get('content-type')).toContain('application/xml');
		const xml = await res.text();
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		const paths = [...xml.matchAll(/<loc>https:\/\/example\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
		const firstOf = (needle: string) => paths.findIndex((p) => p === needle);
		const order = ['/', '/blog', '/series', '/about'].map(firstOf);
		expect(order.every((i) => i >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
});
