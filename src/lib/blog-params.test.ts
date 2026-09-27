import { describe, it, expect } from 'vitest';
import { parseBlogParams, blogQuery } from './blog-params';

const sp = (q: string) => new URLSearchParams(q);

describe('parseBlogParams', () => {
	it('defaults an empty query to page 1 / newest', () => {
		expect(parseBlogParams(sp(''))).toEqual({
			page: 1,
			tag: null,
			year: null,
			sort: 'new',
			q: null,
			type: null,
			series: null,
			sonly: false
		});
	});

	it('parses all six params', () => {
		expect(
			parseBlogParams(
				sp('page=3&tag=SvelteKit&year=2026&sort=views&q=gsap&type=devlog&series=my-book&sonly=1')
			)
		).toEqual({
			page: 3,
			tag: 'SvelteKit',
			year: 2026,
			sort: 'views',
			q: 'gsap',
			type: 'devlog',
			series: 'my-book',
			sonly: true
		});
	});

	it('rejects malformed values back to defaults', () => {
		// Phase 55: type is a dynamic category slug — any valid format is accepted (existence is the DB layer's job);
		// only whitespace/special characters fall back to null
		const bad = parseBlogParams(sp('page=abc&year=1999&sort=hack&tag=%20&q=%20&type=dev%20log'));
		expect(bad).toEqual({
			page: 1,
			tag: null,
			year: null,
			sort: 'new',
			q: null,
			type: null,
			series: null,
			sonly: false
		});
		expect(parseBlogParams(sp('type=tutorial')).type).toBe('tutorial');
	});

	it('clamps page below 1', () => {
		expect(parseBlogParams(sp('page=-5')).page).toBe(1);
	});

	it('caps q at 64 chars', () => {
		const long = parseBlogParams(sp('q=' + 'x'.repeat(100)));
		expect(long.q).toHaveLength(64);
	});

	it('keeps unicode tags intact', () => {
		expect(parseBlogParams(sp('tag=' + encodeURIComponent('前端'))).tag).toBe('前端');
	});
});

describe('blogQuery', () => {
	it('omits defaults (page 1, sort new, no filters) → empty string', () => {
		expect(
			blogQuery({
				tag: null,
				year: null,
				sort: 'new',
				page: 1,
				q: null,
				type: null,
				series: null,
				sonly: false
			})
		).toBe('');
	});

	it('emits only non-default params in stable order', () => {
		expect(
			blogQuery({
				q: 'ai',
				tag: 'GSAP',
				year: 2026,
				sort: 'views',
				page: 2,
				type: 'devlog',
				series: 'b1',
				sonly: false
			})
		).toBe('?q=ai&tag=GSAP&type=devlog&series=b1&year=2026&sort=views&page=2');
	});

	it('round-trips through parseBlogParams', () => {
		const state = {
			tag: 'AI',
			year: 2025,
			sort: 'views' as const,
			page: 4,
			q: '動畫',
			type: 'experiment' as const,
			series: 'x-y' as const,
			sonly: true
		};
		expect(parseBlogParams(sp(blogQuery(state)))).toEqual(state);
	});
});
