/** P83c unit: extension manifest validator (+ the shop packaging example). */
import { describe, it, expect } from 'vitest';
import { validateExtensionManifest } from './manifest';

const minimal = { id: 'my-ext', name: 'My Extension', version: '1.0.0' };

describe('validateExtensionManifest', () => {
	it('accepts a minimal manifest (string or object)', () => {
		expect(validateExtensionManifest(minimal).ok).toBe(true);
		expect(validateExtensionManifest(JSON.stringify(minimal)).ok).toBe(true);
	});
	it('rejects bad id / version / missing name', () => {
		expect(validateExtensionManifest({ ...minimal, id: 'Bad ID' }).ok).toBe(false);
		expect(validateExtensionManifest({ ...minimal, version: 'v1' }).ok).toBe(false);
		expect(validateExtensionManifest({ id: 'x', version: '1' }).ok).toBe(false);
		expect(validateExtensionManifest('not json{').ok).toBe(false);
	});
	it('validates contentTypes shape', () => {
		const bad = validateExtensionManifest({
			...minimal,
			contentTypes: [{ key: 'Notes', label: '', fields: [] }]
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.errors.length).toBeGreaterThanOrEqual(3);
	});
	it('rejects unknown slot names and bad component ids', () => {
		expect(validateExtensionManifest({ ...minimal, slots: { 'nope.slot': ['a'] } }).ok).toBe(false);
		expect(validateExtensionManifest({ ...minimal, slots: { 'post.after': ['BAD'] } }).ok).toBe(
			false
		);
		expect(validateExtensionManifest({ ...minimal, slots: { 'post.after': ['ok-card'] } }).ok).toBe(
			true
		);
	});
	it('component code is required and capped', () => {
		expect(
			validateExtensionManifest({ ...minimal, components: [{ name: 'c1', code: '  ' }] }).ok
		).toBe(false);
		expect(
			validateExtensionManifest({
				...minimal,
				components: [{ name: 'c1', code: 'x'.repeat(100 * 1024 + 1) }]
			}).ok
		).toBe(false);
	});
	it('settings must be a small object', () => {
		expect(validateExtensionManifest({ ...minimal, settings: [1] }).ok).toBe(false);
		expect(validateExtensionManifest({ ...minimal, settings: { a: 'x'.repeat(9000) } }).ok).toBe(
			false
		);
	});

	it('shop packaging example validates (79e commerce as an extension)', () => {
		const shop = {
			id: 'shop',
			name: 'Shop (digital goods)',
			version: '1.0.0',
			description: 'Packages the 79e commerce surface: products type + shop slot wiring.',
			contentTypes: [
				{
					key: 'products',
					label: '產品',
					titleField: 'title',
					fields: [
						{ key: 'title', kind: 'text', required: true, max: 80 },
						{ key: 'summary', kind: 'text', max: 300 },
						{ key: 'price', kind: 'text', required: true, max: 12 },
						{ key: 'body', kind: 'markdown' },
						{ key: 'cover', kind: 'media' },
						{ key: 'file', kind: 'media', required: true }
					]
				}
			],
			settings: { currencyHint: 'set COMMERCE_CURRENCY env for zero-decimal (jpy/twd)' },
			capabilities: ['commerce']
		};
		const r = validateExtensionManifest(shop);
		expect(r.ok).toBe(true);
	});
});
