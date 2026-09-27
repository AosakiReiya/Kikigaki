/**
 * Phase 79a registry contract tests. The behavioural guard for "zero change"
 * lives in the live sitemap assertions (p61 e2e archive + smoke below);
 * these pin the manifest shape future batches (79b forms, 79c agent tool,
 * 79d portfolio) must not silently break.
 */
import { describe, expect, it } from 'vitest';
import { getContentType, listContentTypes, registerContentType } from '$lib/server/content-types';

describe('content-type registry (79a)', () => {
	it('builtins registered in contract order (sitemap output depends on it)', () => {
		expect(listContentTypes().map((t) => t.key)).toEqual(['posts', 'pages', 'series']);
	});

	it('pathFor maps slugs to the historical routes', () => {
		expect(getContentType('posts')?.pathFor('hello')).toBe('/blog/hello');
		expect(getContentType('pages')?.pathFor('legal')).toBe('/legal');
		expect(getContentType('series')?.pathFor('book-a')).toBe('/series/book-a');
	});

	it('listPath only for types with an index listing', () => {
		expect(getContentType('posts')?.listPath).toBe('/blog');
		expect(getContentType('series')?.listPath).toBe('/series');
		expect(getContentType('pages')?.listPath).toBeUndefined();
	});

	it('every manifest declares fields + a localized markdown body where prose', () => {
		for (const t of listContentTypes()) {
			expect(t.fields.length, t.key).toBeGreaterThan(0);
			for (const f of t.fields) expect(f.key, `${t.key}.${f.key}`).toBeTruthy();
		}
		const body = getContentType('posts')?.fields.find((f) => f.key === 'body');
		expect(body?.kind).toBe('markdown');
		expect(body?.localized).toBe(true);
	});

	it('refs tolerate a missing database (never throw)', async () => {
		for (const t of listContentTypes()) {
			expect(await t.refs(undefined)).toEqual([]);
		}
	});

	it('duplicate registration is a hard error', () => {
		const dup = { ...getContentType('posts')!, key: 'posts' };
		expect(() => registerContentType(dup)).toThrow(/already registered/);
	});

	it('jsonLdType declared per type (79d will consume; 79a must not regress)', () => {
		expect(getContentType('posts')?.jsonLdType).toBe('BlogPosting');
		expect(getContentType('pages')?.jsonLdType).toBe('WebPage');
		expect(getContentType('series')?.jsonLdType).toBe('CollectionPage');
	});
});
