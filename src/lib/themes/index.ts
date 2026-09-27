/**
 * Design theme registry (Phase 20) — Style (themes.css tokens) + Behavior (transition/entrance strategies).
 * Layout slots (header/footer component swap) deferred: v1 themes fully reskin via tokens + behavior;
 * layout componentization waits to be co-designed with the Registry (Phase 22) — avoids half-baked slots locking the API.
 */

// theme-scaffold:ids (injection point for scripts/theme-create.mjs)
// theme-scaffold:ids (injection point for scripts/theme-create.mjs)
export const THEME_IDS = [
	'abstract',
	'minimal',
	'terminal',
	'magazine',
	'corporate',
	'news',
	'shop'
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type TransitionStyle = 'curtain' | 'fade';

export interface ThemeBehavior {
	/** page transition: curtain = branded drape; fade = plain local fade in/out */
	transition: TransitionStyle;
	/** whether the first-visit branded Preloader is enabled */
	preloader: boolean;
	/** stagger tempo multiplier for list/body entrances (<1 = faster) */
	staggerScale: number;
}

export interface ThemeManifest {
	id: ThemeId;
	label: string;
	description: string;
	/** admin card swatches (four representative colors) */
	swatches: [string, string, string, string];
	behavior: ThemeBehavior;
}

export const THEME_ABSTRACT: ThemeBehavior = {
	transition: 'curtain',
	preloader: true,
	staggerScale: 1
};

export const themes: Record<ThemeId, ThemeManifest> = {
	abstract: {
		id: 'abstract',
		label: 'Abstract（基準）',
		description: '現行設計：電光萊姆、Space Grotesk、布簾轉場、品牌 Preloader、噪點材質。',
		swatches: ['#d4ff3f', '#141414', '#faf9f6', '#64751a'],
		behavior: THEME_ABSTRACT
	},
	minimal: {
		id: 'minimal',
		label: 'Minimal',
		description:
			'同款排版的克制版：翡翠綠強調、大標題收斂、材質減量；轉場改局部淡入、關閉 Preloader。',
		swatches: ['#3ddc84', '#0a0a0b', '#faf9f6', '#1d7a43'],
		behavior: { transition: 'fade', preloader: false, staggerScale: 0.6 }
	},
	terminal: {
		id: 'terminal',
		label: 'Terminal',
		description:
			'結構換肤：命令列頁首、ls 檔案表首頁、man page 文章頁；螢光綠／紙綠雙模式，快速 fade。',
		swatches: ['#2bd547', '#060d06', '#eef0e6', '#7ee787'],
		behavior: { transition: 'fade', preloader: false, staggerScale: 0.8 }
	},
	magazine: {
		id: 'magazine',
		label: 'Magazine',
		description: '印刷雜誌：襯線標題與內文、暖紙與夜讀雙色盤、橘紅墨色強調。',
		swatches: ['#c2410c', '#14100b', '#f7f2e9', '#f59e0b'],
		behavior: { transition: 'curtain', preloader: true, staggerScale: 1 }
	},
	corporate: {
		id: 'corporate',
		label: 'Corporate',
		description: '公司主頁型：信任感 navy 盤、行銷式首頁（hero＋服務＋動態＋CTA）。',
		swatches: ['#0f62fe', '#0a1f44', '#f6f9fc', '#78a9ff'],
		behavior: { transition: 'fade', preloader: false, staggerScale: 1 }
	},
	news: {
		id: 'news',
		label: 'Newsroom',
		description: '新聞媒體型：頭條＋密排網格、報眉式首頁、紅黑快訊色盤。',
		swatches: ['#c8102e', '#111111', '#fafafa', '#8b0000'],
		behavior: { transition: 'fade', preloader: false, staggerScale: 1 }
	},
	shop: {
		id: 'shop',
		label: 'Shop',
		description: 'Shop 主題（theme-create 生成骨架——改 packs/tokens 成形）',
		swatches: ['#d4ff3f', '#141414', '#faf9f6', '#64751a'],
		behavior: { transition: 'curtain', preloader: false, staggerScale: 1 }
	}
	// theme-scaffold:entries (new-theme manifest injection point)
};

export function isThemeId(v: unknown): v is ThemeId {
	return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}

/** 78c: DB theme id = `db-` prefix + slug (regex single-sourced here, shared client/server) */
export type ActiveThemeId = ThemeId | `db-${string}`;
export const DB_THEME_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
export function isDbThemeId(v: unknown): v is `db-${string}` {
	return typeof v === 'string' && v.startsWith('db-') && DB_THEME_SLUG_RE.test(v.slice(3));
}
export function isValidThemeId(v: unknown): v is ActiveThemeId {
	return isThemeId(v) || isDbThemeId(v);
}

export function themeManifest(id: unknown): ThemeManifest {
	return isThemeId(id) ? themes[id] : themes.abstract;
}

/** 78c batch 4: per-theme behavior overrides (enums/numbers only, zero executable surface) */
export interface DbThemeBehaviors {
	transition?: TransitionStyle;
	preloader?: boolean;
	staggerScale?: number;
}

export function validateBehaviors(raw: unknown): {
	ok: boolean;
	error?: string;
	value?: DbThemeBehaviors;
} {
	if (raw === '' || raw === undefined || raw === null) return { ok: true, value: {} };
	let obj: unknown = raw;
	if (typeof raw === 'string') {
		try {
			obj = JSON.parse(raw);
		} catch {
			return { ok: false, error: 'behaviors is not valid JSON' };
		}
	}
	if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
		return { ok: false, error: 'behaviors must be an object' };
	const o = obj as Record<string, unknown>;
	const out: DbThemeBehaviors = {};
	if (o.transition !== undefined) {
		if (o.transition !== 'curtain' && o.transition !== 'fade')
			return { ok: false, error: 'transition must be curtain|fade' };
		out.transition = o.transition;
	}
	if (o.preloader !== undefined) {
		if (typeof o.preloader !== 'boolean')
			return { ok: false, error: 'preloader must be a boolean' };
		out.preloader = o.preloader;
	}
	if (o.staggerScale !== undefined) {
		if (typeof o.staggerScale !== 'number' || !Number.isFinite(o.staggerScale))
			return { ok: false, error: 'staggerScale must be a number' };
		out.staggerScale = Math.min(2, Math.max(0.2, o.staggerScale));
	}
	return { ok: true, value: out };
}
