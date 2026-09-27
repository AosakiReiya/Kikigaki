import { describe, expect, it } from 'vitest';
import { artifactKey, hashSource } from './compile-cache';

describe('compile-cache pure helpers (P2)', () => {
	it('artifactKey namespaces by theme + surface', () => {
		expect(artifactKey('db-neon', 'Home')).toBe('db-neon:Home');
	});
	it('hashSource is stable, sensitive and hex', () => {
		const a = hashSource('<h1>x</h1>');
		expect(hashSource('<h1>x</h1>')).toBe(a);
		expect(hashSource('<h1>y</h1>')).not.toBe(a);
		expect(hashSource('')).toMatch(/^[0-9a-f]{1,8}$/);
	});
});
