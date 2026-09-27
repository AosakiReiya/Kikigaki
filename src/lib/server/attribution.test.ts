import { describe, expect, it } from 'vitest';
import { classifyChannel, refDomainOf } from './attribution';

describe('refDomainOf', () => {
	it('抽取網域（去 www.）', () => {
		expect(refDomainOf('https://www.google.com/url?q=x', 'kikigaki.example')).toBe('google.com');
	});
	it('同源與空值回 null', () => {
		expect(refDomainOf('https://kikigaki.example/blog/a', 'kikigaki.example')).toBeNull();
		expect(refDomainOf(null, 'kikigaki.example')).toBeNull();
		expect(refDomainOf('', 'kikigaki.example')).toBeNull();
	});
	it('髒值不炸', () => {
		expect(refDomainOf('not a url', 'kikigaki.example')).toBeNull();
		expect(refDomainOf('javascript:alert(1)', 'kikigaki.example')).toBeNull();
	});
});

describe('classifyChannel', () => {
	it('無 UTM 無 referer → direct', () => {
		expect(classifyChannel({ refDomain: null })).toBe('direct');
	});
	it('搜尋引擎 referer → search', () => {
		expect(classifyChannel({ refDomain: 'google.com' })).toBe('search');
		expect(classifyChannel({ refDomain: 'duckduckgo.com' })).toBe('search');
	});
	it('社群網域 referer → social', () => {
		expect(classifyChannel({ refDomain: 'threads.net' })).toBe('social');
		expect(classifyChannel({ refDomain: 'bsky.app' })).toBe('social');
		expect(classifyChannel({ refDomain: 'x.com' })).toBe('social');
	});
	it('其他網域 → referral', () => {
		expect(classifyChannel({ refDomain: 'blog.example.org' })).toBe('referral');
	});
	it('UTM medium 優先', () => {
		expect(classifyChannel({ refDomain: 'news.ycombinator.com', utmMedium: 'email' })).toBe(
			'email'
		);
		expect(classifyChannel({ refDomain: null, utmMedium: 'cpc' })).toBe('ads');
		expect(classifyChannel({ refDomain: 'google.com', utmMedium: 'organic' })).toBe('search');
	});
	it('UTM source 對照（medium 不認識時）', () => {
		expect(classifyChannel({ refDomain: null, utmMedium: 'post', utmSource: 'twitter' })).toBe(
			'social'
		);
	});
	it('有 UTM 但都認不出 → campaign', () => {
		expect(classifyChannel({ refDomain: null, utmMedium: 'partnership' })).toBe('campaign');
	});
});
