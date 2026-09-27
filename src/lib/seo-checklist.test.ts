import { describe, expect, it } from 'vitest';
import { checklistScore, discoveryFlow, runSeoChecks, type ChecklistInput } from './seo-checklist';

const base: ChecklistInput = {
	title: '一篇足夠長的文章標題示例',
	description:
		'這是一段介於五十到一百六十個字元之間的描述文字，用來通過檢查表的長度區間測試，所以必須寫得足夠長才對。',
	body: '## 第一節\n內容 [站內](/blog/x) 與 [外部](https://refs.example.org/a) 連結\n![說明圖](/img.png)',
	hasOgImage: true,
	customCanonical: false,
	published: true,
	robotsIndex: true,
	siteUrl: 'https://example.com'
};

const get = (label: string, over: Partial<ChecklistInput> = {}) =>
	runSeoChecks({ ...base, ...over }).find((c) => c.label === label)!;

describe('runSeoChecks', () => {
	it('理想文章全 ok（除章節數）', () => {
		const checks = runSeoChecks({ ...base, body: base.body + '\n## 第二節\n更多內容' });
		expect(checks.every((c) => c.level === 'ok')).toBe(true);
		expect(checklistScore(checks).done).toBe(checks.length);
	});
	it('標題過長 warn、空 bad', () => {
		expect(get('標題', { title: 'x'.repeat(70) }).level).toBe('warn');
		expect(get('標題', { title: '' }).level).toBe('bad');
	});
	it('描述缺＝bad、超長＝warn', () => {
		expect(get('描述', { description: '' }).level).toBe('bad');
		expect(get('描述', { description: 'y'.repeat(200) }).level).toBe('warn');
	});
	it('無 h2 → warn 章節結構', () => {
		expect(get('章節結構', { body: '純文字沒有小節' }).level).toBe('warn');
	});
	it('無分享圖 → warn；alt 缺 → warn', () => {
		expect(get('分享圖', { hasOgImage: false }).level).toBe('warn');
		expect(get('圖片 alt', { body: '![](/x.png)' }).level).toBe('warn');
	});
	it('內鏈外鏈偵測：站內 /blog 計內、跨域計外、本站絕對 URL 不算外链', () => {
		const c = runSeoChecks({
			...base,
			body: '[a](https://example.com/blog/x) [b](https://refs.example.org) [c](/y)'
		});
		expect(c.find((x) => x.label === '內部連結')?.level).toBe('ok');
		expect(c.find((x) => x.label === '外部連結')?.detail).toContain('1 條');
	});
	it('未發布 → sitemap warn；noindex → 提示退出', () => {
		expect(get('Sitemap 收錄', { published: false }).level).toBe('warn');
		const ni = get('Sitemap 收錄', { robotsIndex: false });
		expect(ni.level).toBe('warn');
		expect(ni.detail).toContain('noindex');
	});
});

describe('discoveryFlow', () => {
	it('健康文章：前四步 ok、後三步 unknown（誠實未整合）', () => {
		const f = discoveryFlow({ published: true, robotsIndex: true, robotsFollow: true });
		expect(f.slice(0, 4).every((s) => s.status === 'ok')).toBe(true);
		expect(f.slice(4).every((s) => s.status === 'unknown')).toBe(true);
	});
	it('草稿：發布 bad、sitemap unknown', () => {
		const f = discoveryFlow({ published: false, robotsIndex: true, robotsFollow: true });
		expect(f[0].status).toBe('bad');
		expect(f[1].status).toBe('unknown');
	});
	it('nofollow → index,follow 步降 unknown', () => {
		const f = discoveryFlow({ published: true, robotsIndex: true, robotsFollow: false });
		expect(f[3].status).toBe('unknown');
	});
});
