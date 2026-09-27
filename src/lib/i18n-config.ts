/**
 * Language catalog model (Phase 67-deploy) — three layers:
 *   L1 config/locales-catalog.json + messages/*.json = catalog (which languages exist)
 *   L2 config/locales.json = deploy-time enabled subset (editable via GitHub Web)
 *   (L3 runtime toggle removed by owner decision — languages are decided at deploy time)
 * Pure functions here: shared by scripts/i18n-sync.mjs (CI/local) and unit tests.
 */

export interface CatalogEntry {
	label: string;
	hreflang: string;
	bcp47: string;
	/** Base-language marker (exactly one true; unmarked = first array key is base) */
	base?: boolean;
}

export type Catalog = Record<string, CatalogEntry>;

export interface SyncPlan {
	/** Final locales to write into inlang settings (base language always first) */
	locales: string[];
	base: string;
	errors: string[];
	notes: string[];
}

export function baseOf(catalog: Catalog): string {
	const flagged = Object.entries(catalog).find(([, v]) => v.base);
	return flagged ? flagged[0] : (Object.keys(catalog)[0] ?? '');
}

/** Parse locales.json (or CLI input) → validate + build the content for inlang settings */
export function planSync(catalog: Catalog, requested: string[], messages: string[]): SyncPlan {
	const errors: string[] = [];
	const notes: string[] = [];
	const base = baseOf(catalog);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of requested) {
		const code = raw.trim();
		if (!code) continue;
		if (!(code in catalog)) errors.push(`字典目錄無此語言：${code}（先 pnpm i18n:add ${code}）`);
		if (!messages.includes(code)) errors.push(`缺字典檔：messages/${code}.json`);
		if (seen.has(code)) {
			notes.push(`重複的 ${code} 已去重`);
			continue;
		}
		seen.add(code);
		out.push(code);
	}
	if (!out.includes(base)) {
		notes.push(`母語 ${base} 不在清單中——已自動補入首位（baseLocale 必須啟用）`);
		out.unshift(base);
	}
	// base language always first (paraglide baseLocale order doesn't matter, but keep it readable)
	const ordered = [base, ...out.filter((c) => c !== base)];
	return { locales: ordered, base, errors, notes };
}

export function needsSync(
	settings: { locales: unknown; baseLocale?: unknown },
	plan: SyncPlan
): boolean {
	const cur = settings.locales;
	if (!Array.isArray(cur) || cur.join(',') !== plan.locales.join(',')) return true;
	return settings.baseLocale !== plan.base;
}
