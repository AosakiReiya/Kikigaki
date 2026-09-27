/**
 * Component Picker Schema — the inserter's single data source.
 * Per component: form fields (dynamically rendered) + form values → preview props + form values → ::: syntax.
 * Phase 17 Workshop's manifest.schema will replace these hand-written definitions.
 */
import { renderMarkdown } from '$lib/markdown';
import { extractYouTubeId } from '$lib/content/util';

export type FieldKind = 'text' | 'textarea' | 'select' | 'number' | 'images';

export interface FieldOption {
	value: string;
	label: string;
}

export interface FieldDef {
	key: string;
	label: string;
	kind: FieldKind;
	options?: FieldOption[];
	placeholder?: string;
	help?: string;
	/* * link candidates (slug input hints for the post component) */
	suggest?: 'posts';
	min?: number;
	max?: number;
}

export type FormValues = Record<string, unknown>;

export interface PreviewSpec {
	props: Record<string, unknown>;
	/* * rendered body of children-mode components (Callout) */
	childrenHtml?: string;
}

export interface PickerDef {
	name: string;
	label: string;
	description: string;
	icon: string;
	fields: FieldDef[];
	/* * sample values (prefilled on selection for easy tweaking) */
	example: FormValues;
	toPreview: (v: FormValues) => PreviewSpec;
	serialize: (v: FormValues) => string;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
/* * attribute value sanitization: double quotes would break ::: parsing — swap to single quotes */
const attr = (v: unknown): string => s(v).replace(/"/g, "'").trim();
const num = (v: unknown, dflt: number): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : dflt;
};
const strList = (v: unknown): string[] =>
	Array.isArray(v) ? v.map(s).filter((x) => x.trim()) : [];

/** key: value 行（跳過空欄） */
function kvLines(values: [string, string][]): string {
	return values
		.filter(([, v]) => v.trim())
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n');
}

/* ------------------------------------------------------------------ */
/* defs                                                                */
/* ------------------------------------------------------------------ */

const callout: PickerDef = {
	name: 'callout',
	label: '提示框',
	description: '資訊／提示／警告／危險四種色調的註記區塊，內文支援 Markdown。',
	icon: '💡',
	fields: [
		{
			key: 'type',
			label: '類型',
			kind: 'select',
			options: [
				{ value: 'info', label: '資訊 info' },
				{ value: 'tip', label: '提示 tip' },
				{ value: 'warning', label: '警告 warning' },
				{ value: 'danger', label: '危險 danger' }
			]
		},
		{ key: 'title', label: '標題（可留空）', kind: 'text', placeholder: '重點提醒' },
		{
			key: 'content',
			label: '內文（Markdown）',
			kind: 'textarea',
			placeholder: '支援**粗體**、[連結](…)、列表…'
		}
	],
	example: { type: 'tip', title: '重點', content: '這裡是**重點提醒**。' },
	toPreview: (v) => ({
		props: { type: s(v.type) || 'info', title: s(v.title) },
		childrenHtml: renderMarkdown(s(v.content)).html
	}),
	serialize: (v) => {
		const t = attr(v.title);
		return `:::callout type=${s(v.type) || 'info'}${t ? ` title="${t}"` : ''}\n${s(v.content)}\n:::`;
	}
};

const youtube: PickerDef = {
	name: 'youtube',
	label: 'YouTube 影片',
	description: '貼上分享連結或影片 ID，自動解析；首載僅顯示縮圖，點擊才載入播放器。',
	icon: '▶️',
	fields: [
		{
			key: 'src',
			label: '影片連結或 ID',
			kind: 'text',
			placeholder: 'https://youtu.be/dQw4w9WgXcQ'
		},
		{ key: 'title', label: '標題（無障礙閱讀用）', kind: 'text', placeholder: '影片標題' }
	],
	example: { src: 'dQw4w9WgXcQ', title: '示範影片' },
	toPreview: (v) => ({ props: { src: s(v.src), title: s(v.title) || 'YouTube video' } }),
	serialize: (v) => {
		const id = extractYouTubeId(s(v.src)) || s(v.src).trim();
		const t = attr(v.title);
		return t ? `:::youtube title="${t}"\n${id}\n:::` : `:::youtube ${id}\n:::`;
	}
};

const post: PickerDef = {
	name: 'post',
	label: '站內文章',
	description: '嵌入其他文章的卡片（標題／摘要／標籤，依瀏覽語系自動顯示）。',
	icon: '📄',
	fields: [
		{
			key: 'slug',
			label: '文章 slug',
			kind: 'text',
			placeholder: 'hello-world',
			suggest: 'posts'
		}
	],
	example: { slug: 'hello-world' },
	toPreview: (v) => ({ props: { slug: s(v.slug) } }),
	serialize: (v) => `:::post ${s(v.slug).trim()}\n:::`
};

const chart: PickerDef = {
	name: 'chart',
	label: '圖表',
	description: '長條／折線／圓環圖（chart.js）。標籤與數值以逗號分隔。',
	icon: '📊',
	fields: [
		{
			key: 'type',
			label: '圖表類型',
			kind: 'select',
			options: [
				{ value: 'bar', label: '長條 bar' },
				{ value: 'line', label: '折線 line' },
				{ value: 'doughnut', label: '圓環 doughnut' }
			]
		},
		{ key: 'labels', label: '標籤（逗號分隔）', kind: 'text', placeholder: '3月,4月,5月' },
		{ key: 'values', label: '數值（逗號分隔）', kind: 'text', placeholder: '120,190,300' },
		{ key: 'height', label: '高度 px', kind: 'number', min: 120, max: 800, placeholder: '280' }
	],
	example: { type: 'bar', labels: '3月,4月,5月,6月', values: '120,190,300,410', height: 280 },
	toPreview: (v) => ({ props: chartProps(v) }),
	serialize: (v) => `:::chart\n${JSON.stringify(chartProps(v))}\n:::`
};

function chartProps(v: FormValues): Record<string, unknown> {
	const labels = s(v.labels)
		.split(/[,，]/)
		.map((x) => x.trim())
		.filter(Boolean);
	const data = s(v.values)
		.split(/[,，]/)
		.map((x) => Number(x.trim()))
		.filter((x) => Number.isFinite(x));
	return {
		type: s(v.type) || 'bar',
		data: { labels, datasets: [{ label: '數據', data }] },
		height: num(v.height, 280)
	};
}

const timeline: PickerDef = {
	name: 'timeline',
	label: '時間軸',
	description: '以條目列表呈現時間線；內文 JSON 陣列 [{date,title,body}]。',
	icon: '🕐',
	fields: [
		{ key: 'title', label: '標題（可留空）', kind: 'text', placeholder: '發展歷程' },
		{
			key: 'items',
			label: '條目（JSON 陣列：[{"date":"2026-01","title":"…","body":"…"}]）',
			kind: 'textarea',
			placeholder: '[{"date":"2026-08","title":"里程碑","body":"說明"}]'
		}
	],
	example: {
		title: '發展路徑',
		items: '[{"date":"2026-08-24","title":"v1 上線","body":"博客 + Admin 完成"}]'
	},
	toPreview: (v) => ({ props: { title: s(v.title), data: jsonList(v.items) } }),
	serialize: (v) => {
		const t = attr(v.title);
		const lines: [string, string][] = [];
		if (t) lines.push(['title', t]);
		lines.push(['data', s(v.items).replace(/\s+/g, ' ').trim() || '[]']);
		return `:::timeline\n${kvLines(lines)}\n:::`;
	}
};

function jsonList(raw: unknown): unknown[] {
	try {
		const parsed: unknown = JSON.parse(s(raw).trim() || '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

const gallery: PickerDef = {
	name: 'gallery',
	label: '圖片畫廊',
	description: '多欄圖片網格，點擊看原圖；圖片從媒體庫挑選或直接貼網址。',
	icon: '🖼️',
	fields: [
		{ key: 'cols', label: '欄數', kind: 'number', min: 1, max: 6, placeholder: '3' },
		{ key: 'images', label: '圖片', kind: 'images' }
	],
	example: { cols: 2, images: ['/covers/hello-world.svg', '/covers/gsap-page-transition.svg'] },
	toPreview: (v) => ({ props: { cols: num(v.cols, 3), data: strList(v.images) } }),
	serialize: (v) => {
		const list = strList(v.images);
		return `:::gallery cols=${num(v.cols, 3)}\n${JSON.stringify(list)}\n:::`;
	}
};

const card: PickerDef = {
	name: 'card',
	label: '連結卡片',
	description: '帶圖片的外部連結卡片，適合資源／專案展示。',
	icon: '🔗',
	fields: [
		{ key: 'kicker', label: '眉標（可留空）', kind: 'text', placeholder: '外部資源' },
		{ key: 'title', label: '標題', kind: 'text', placeholder: 'Cloudflare 開發者文件' },
		{ key: 'desc', label: '說明', kind: 'textarea', placeholder: '一句話描述這張卡片' },
		{ key: 'url', label: '連結 URL', kind: 'text', placeholder: 'https://…' },
		{ key: 'image', label: '圖片（可留空）', kind: 'text', placeholder: '封面圖網址或 /media/…' }
	],
	example: {
		kicker: '外部資源',
		title: 'Cloudflare 開發者文件',
		desc: '本站以 Pages / D1 / R2 無伺服架構運行',
		url: 'https://developers.cloudflare.com',
		image: ''
	},
	toPreview: (v) => ({
		props: {
			kicker: s(v.kicker),
			title: s(v.title),
			desc: s(v.desc),
			url: s(v.url),
			image: s(v.image)
		}
	}),
	serialize: (v) =>
		`:::card\n${kvLines([
			['kicker', attr(v.kicker)],
			['title', attr(v.title)],
			['desc', s(v.desc).replace(/\n+/g, ' ').trim()],
			['url', s(v.url).trim()],
			['image', s(v.image).trim()]
		])}\n:::`
};

const code: PickerDef = {
	name: 'code',
	label: '程式碼示範',
	description: '多檔分頁的程式碼塊，附複製與「執行」（console 輸出捕捉）。',
	icon: '⌨️',
	fields: [
		{ key: 'filename', label: '檔案名', kind: 'text', placeholder: 'demo.js' },
		{
			key: 'lang',
			label: '語言',
			kind: 'select',
			options: [
				{ value: 'js', label: 'JavaScript' },
				{ value: 'ts', label: 'TypeScript' },
				{ value: 'text', label: '文字（隱藏執行鈕）' }
			]
		},
		{ key: 'source', label: '程式碼', kind: 'textarea', placeholder: 'console.log("hi");' }
	],
	example: {
		filename: 'fib.js',
		lang: 'js',
		source:
			'const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));\nconsole.log([0,1,2,3,4,5].map(fib));'
	},
	toPreview: (v) => ({
		props: {
			title: s(v.filename),
			lang: s(v.lang) || 'js',
			data: { [s(v.filename) || 'demo']: s(v.source) }
		}
	}),
	serialize: (v) =>
		`:::code title="${attr(v.filename) || 'demo'}" lang=${s(v.lang) || 'js'}\n${JSON.stringify({ [s(v.filename) || 'demo']: s(v.source) })}\n:::`
};

export const pickerDefs: PickerDef[] = [
	callout,
	youtube,
	post,
	chart,
	timeline,
	gallery,
	card,
	code
];

export function pickerDefFor(name: string): PickerDef | undefined {
	return pickerDefs.find((d) => d.name === name);
}
