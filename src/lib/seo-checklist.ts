/** SEO Technical Checklist (Phase 64) — pure functions, instantly computable.
 *  Deliberately named a "technical checklist", not a score: completeness ≠ Google ranking signal. */

export interface ChecklistInput {
	/** effective title (seoTitle || post title) */
	title: string;
	/** effective description (seoDescription || summary) */
	description: string;
	/** body markdown (draft) */
	body: string;
	/** whether the OG image resolution chain yields a value (og→cover→site default) */
	hasOgImage: boolean;
	/** custom canonical? */
	customCanonical: boolean;
	published: boolean;
	robotsIndex: boolean;
	siteUrl: string;
}

export interface Check {
	label: string;
	level: 'ok' | 'warn' | 'bad';
	detail: string;
}

const SITE_HOST_RE = /^https?:\/\/([^/]+)/;

export function runSeoChecks(i: ChecklistInput): Check[] {
	const out: Check[] = [];
	const t = i.title.trim();
	const d = i.description.trim();
	const body = i.body;

	out.push(
		t.length === 0
			? { label: '標題', level: 'bad', detail: '缺標題' }
			: t.length > 60
				? { label: '標題', level: 'warn', detail: `${t.length} 字（建議 ≤60，Google 可能截斷）` }
				: t.length < 10
					? { label: '標題', level: 'warn', detail: `${t.length} 字（過短難突顯）` }
					: { label: '標題', level: 'ok', detail: `${t.length} 字` }
	);

	out.push(
		d.length === 0
			? { label: '描述', level: 'bad', detail: '無描述亦無摘要' }
			: d.length > 160
				? { label: '描述', level: 'warn', detail: `${d.length} 字（建議 ≤160）` }
				: d.length < 50
					? { label: '描述', level: 'warn', detail: `${d.length} 字（建議 50–160）` }
					: { label: '描述', level: 'ok', detail: `${d.length} 字` }
	);

	out.push({
		label: 'Canonical',
		level: 'ok',
		detail: i.customCanonical ? '自訂外部來源' : '自動（本站網址）'
	});

	const h2 = (body.match(/^##\s+(.+)$/gm) ?? []).length;
	out.push(
		h2 >= 2
			? { label: '章節結構', level: 'ok', detail: `${h2} 個 h2` }
			: h2 === 1
				? { label: '章節結構', level: 'warn', detail: '僅 1 個 h2（長文建議分節）' }
				: { label: '章節結構', level: 'warn', detail: '無 h2 小節（目錄／摘要抓取較弱）' }
	);

	out.push(
		i.hasOgImage
			? { label: '分享圖', level: 'ok', detail: 'OG/JSON-LD image 有值' }
			: { label: '分享圖', level: 'warn', detail: '無封面也無站級預設圖（社群卡只有文字）' }
	);

	const host = i.siteUrl.match(SITE_HOST_RE)?.[1] ?? '';
	const links = (body.match(/\]\(([^)\s]+)/g) ?? []).map((l) => l.slice(2).trim());
	const internalReal = links.filter((l) => l.startsWith('/') && !l.startsWith('//')).length;
	const external = links.filter((l) => {
		if (!/^https?:\/\//.test(l)) return false;
		try {
			return new URL(l).hostname.replace(/^www\./, '') !== host.replace(/^www\./, '');
		} catch {
			return false;
		}
	}).length;

	out.push(
		internalReal > 0
			? { label: '內部連結', level: 'ok', detail: `${internalReal} 條站內鏈接` }
			: { label: '內部連結', level: 'warn', detail: '無站內連結（發現路徑較弱）' }
	);
	out.push(
		external > 0
			? { label: '外部連結', level: 'ok', detail: `${external} 條（來源佐證）` }
			: { label: '外部連結', level: 'warn', detail: '無外链（非必須）' }
	);

	const imgs = [...body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
	const noAlt = imgs.filter((m) => m[1].trim() === '').length;
	out.push(
		imgs.length === 0
			? { label: '圖片 alt', level: 'ok', detail: '本頁無內文圖片' }
			: noAlt > 0
				? { label: '圖片 alt', level: 'warn', detail: `${noAlt}/${imgs.length} 張缺 alt` }
				: { label: '圖片 alt', level: 'ok', detail: `${imgs.length} 張全有 alt` }
	);

	const richReady = i.hasOgImage && t.length > 0 && d.length > 0;
	out.push({
		label: 'JSON-LD',
		level: 'ok',
		detail: richReady ? 'Article＋Breadcrumb 已輸出' : '節點存在但圖/描述不足，Rich Result 機率低'
	});

	out.push(
		!i.published
			? { label: 'Sitemap 收錄', level: 'warn', detail: '未發布（不入 sitemap）' }
			: !i.robotsIndex
				? { label: 'Sitemap 收錄', level: 'warn', detail: 'noindex：已自動退出 sitemap' }
				: { label: 'Sitemap 收錄', level: 'ok', detail: '已入 /sitemap.xml' }
	);
	return out;
}

export function checklistScore(checks: Check[]): { done: number; total: number } {
	return { done: checks.filter((c) => c.level === 'ok').length, total: checks.length };
}

export interface FlowStep {
	label: string;
	status: 'ok' | 'bad' | 'unknown';
	detail: string;
}

/** Google discovery path (post level): crawl/indexed stay Unknown until Search Console is connected (honest) */
export function discoveryFlow(i: {
	published: boolean;
	robotsIndex: boolean;
	robotsFollow: boolean;
}): FlowStep[] {
	const inSitemap = i.published && i.robotsIndex;
	return [
		{
			label: '發布',
			status: i.published ? 'ok' : 'bad',
			detail: i.published ? '已發布' : '草稿（前台 404）'
		},
		{
			label: 'Sitemap',
			status: inSitemap ? 'ok' : 'unknown',
			detail: inSitemap ? '已入 /sitemap.xml' : '未收錄（先解決發布與 noindex）'
		},
		{
			label: 'robots.txt',
			status: i.robotsIndex ? 'ok' : 'bad',
			detail: i.robotsIndex ? '允許收錄本文' : '本文 noindex'
		},
		{
			label: 'index, follow',
			status: i.robotsIndex ? (i.robotsFollow ? 'ok' : 'unknown') : 'bad',
			detail: `${i.robotsIndex ? 'index' : 'noindex'}, ${i.robotsFollow ? 'follow' : 'nofollow'}`
		},
		{ label: 'Googlebot 抓取', status: 'unknown', detail: '需 Search Console URL 檢查（未整合）' },
		{ label: '收錄', status: 'unknown', detail: '需 Search Console（未整合）' },
		{ label: '搜尋外觀', status: 'unknown', detail: 'SERP 卡見上方預覽；實際由 Google 決定' }
	];
}
