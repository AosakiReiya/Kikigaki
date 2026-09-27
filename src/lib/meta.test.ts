import { describe, expect, it } from 'vitest';
import { buildMeta, robotsContent } from './meta';

describe('robotsContent（Phase 61）', () => {
	it('純默認（index+follow）不發 tag', () => {
		expect(robotsContent({ index: true, follow: true })).toBeNull();
		expect(robotsContent({})).toBeNull();
		expect(
			robotsContent({ index: true, follow: true, maxSnippet: null, maxImagePreview: null })
		).toBeNull();
	});
	it('noindex', () => {
		expect(robotsContent({ index: false, follow: true })).toBe('noindex, follow');
	});
	it('nofollow 單獨', () => {
		expect(robotsContent({ index: true, follow: false })).toBe('index, nofollow');
	});
	it('nosnippet 與 max-snippet', () => {
		expect(robotsContent({ index: true, follow: true, maxSnippet: -1 })).toBe(
			'index, follow, nosnippet'
		);
		expect(robotsContent({ index: true, follow: true, maxSnippet: 160 })).toBe(
			'index, follow, max-snippet:160'
		);
	});
	it('max-image-preview 非 large 才發', () => {
		expect(robotsContent({ index: true, follow: true, maxImagePreview: 'large' })).toBeNull();
		expect(robotsContent({ index: true, follow: true, maxImagePreview: 'none' })).toBe(
			'index, follow, max-image-preview:none'
		);
	});
	it('全組合', () => {
		expect(
			robotsContent({ index: false, follow: false, maxSnippet: 80, maxImagePreview: 'standard' })
		).toBe('noindex, nofollow, max-snippet:80, max-image-preview:standard');
	});
});

describe('buildMeta（Phase 62 OG/Twitter 全套）', () => {
	const base = { title: '文章', description: '摘要', path: '/blog/a' };
	const tag = (tags: { property?: string; name?: string; content: string }[], key: string) =>
		tags.find((t) => t.property === key || t.name === key)?.content;
	it('article:tag 修 [object Object]（TagRef→display，退回 name）', () => {
		const m = buildMeta({ ...base, tags: [{ name: 'dev', display: '開發' }, 'plain'] });
		const ts = m.tags.filter((t) => t.property === 'article:tag').map((t) => t.content);
		expect(ts).toEqual(['開發', 'plain']);
	});
	it('og 覆寫鏈：ogTitle/ogDescription 優先，twitter 鏡像 og', () => {
		const m = buildMeta({ ...base, ogTitle: '分享標題', ogDescription: '分享描述' });
		expect(tag(m.tags, 'og:title')).toBe('分享標題');
		expect(tag(m.tags, 'og:description')).toBe('分享描述');
		expect(tag(m.tags, 'twitter:title')).toBe('分享標題');
		expect(tag(m.tags, 'twitter:description')).toBe('分享描述');
		expect(tag(m.tags, 'description')).toBe('摘要');
	});
	it('twitter:card 覆寫與 twitter:site', () => {
		const m = buildMeta({ ...base, twitterCard: 'summary', twitterSite: '@kikigaki' });
		expect(tag(m.tags, 'twitter:card')).toBe('summary');
		expect(tag(m.tags, 'twitter:site')).toBe('@kikigaki');
	});
	it('modified_time 僅在與 published 不同時發；section 存在才發', () => {
		const same = buildMeta({ ...base, publishedTime: '2026-01-01', modifiedTime: '2026-01-01' });
		expect(same.tags.some((t) => t.property === 'article:modified_time')).toBe(false);
		const diff = buildMeta({
			...base,
			publishedTime: '2026-01-01',
			modifiedTime: '2026-02-02',
			section: '技術'
		});
		expect(tag(diff.tags, 'article:modified_time')).toBe('2026-02-02');
		expect(tag(diff.tags, 'article:section')).toBe('技術');
	});
	it('og:image:alt 有 alt 才發；twitter:image 跟隨', () => {
		const m = buildMeta({ ...base, image: '/media/x.png', ogImageAlt: '封面說明' });
		expect(tag(m.tags, 'og:image:alt')).toBe('封面說明');
		expect(tag(m.tags, 'twitter:image')).toBeTruthy();
	});
});

describe('buildMeta（Phase 61 擴充）', () => {
	it('robots 給定時發出 meta robots', () => {
		const m = buildMeta({
			title: 'T',
			description: 'D',
			path: '/blog/x',
			robots: 'noindex, follow'
		});
		expect(m.tags).toContainEqual({ name: 'robots', content: 'noindex, follow' });
	});
	it('noindex 旗標與 robots 共存時 robots 優先、不重複', () => {
		const m = buildMeta({
			title: 'T',
			description: 'D',
			path: '/blog/x',
			noindex: true,
			robots: 'noindex, nofollow'
		});
		const robots = m.tags.filter((t) => t.name === 'robots');
		expect(robots).toHaveLength(1);
		expect(robots[0].content).toBe('noindex, nofollow');
	});
	it('自訂 canonical 不改寫 og:url', () => {
		const m = buildMeta({
			title: 'T',
			description: 'D',
			path: '/blog/x',
			canonical: 'https://elsewhere.example/original'
		});
		expect(m.canonical).toBe('https://elsewhere.example/original');
		expect(m.tags).toContainEqual({ property: 'og:url', content: m.url });
		expect(m.url).not.toBe('https://elsewhere.example/original');
	});
	it('未給 canonical 時＝url（本站本地化 canonical）', () => {
		const m = buildMeta({ title: 'T', description: 'D', path: '/blog/x', url: 'https://a/b' });
		expect(m.canonical).toBe('https://a/b');
	});
});
