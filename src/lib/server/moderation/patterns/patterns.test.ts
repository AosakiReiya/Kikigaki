import { describe, expect, it } from 'vitest';
import { matchSpamPatterns } from './patterns';

describe('matchSpamPatterns（65k corpus）', () => {
	it('returns zero hits for clean Chinese content', () => {
		expect(matchSpamPatterns('這是一篇正常的留言。')).toEqual({ hits: 0, samples: [] });
	});

	it('returns zero hits for empty input', () => {
		expect(matchSpamPatterns('')).toEqual({ hits: 0, samples: [] });
	});

	it('detects common spam phrases case-insensitively', () => {
		const r = matchSpamPatterns('Buy cheap Viagra online now, CLICK HERE for a casino bonus');
		expect(r.hits).toBeGreaterThan(0);
		expect(r.samples.length).toBeGreaterThan(0);
	});

	it('counts multiple hits for known exact patterns', () => {
		const r = matchSpamPatterns('buy cheap viagra click here free money cheap online casino bonus');
		expect(r.hits).toBeGreaterThan(3);
	});

	it('caps samples at maxSamples but keeps full hit count', () => {
		const content = 'buy cheap viagra click here free money cheap online casino bonus';
		const r = matchSpamPatterns(content, 3);
		expect(r.hits).toBeGreaterThan(3);
		expect(r.samples.length).toBe(3);
	});
});
