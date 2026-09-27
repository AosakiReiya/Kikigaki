#!/usr/bin/env node
/**
 * Remove a language from the catalog (L1). Content translation rows (post/series_translations)
 * are kept by default — re-adding the language brings them back; only --purge deletes them
 * (and shows the row count first).
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const code = process.argv.slice(2).find((a) => !a.startsWith('--'));
const purge = process.argv.includes('--purge');
if (!code) {
	console.error('用法：pnpm i18n:remove <code> [--purge]');
	process.exit(1);
}
const catalogPath = join(root, 'config', 'locales-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
if (catalog[code]?.base) {
	console.error(`✕ ${code} 是母語（base），不可移除`);
	process.exit(1);
}
if (!(code in catalog)) {
	console.error(`✕ catalog 無 ${code}`);
	process.exit(1);
}
// translation inventory hint (remote D1 read-only count; skip when unreachable)
try {
	const j = execFileSync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			'kikigaki',
			'--remote',
			'--json',
			'--command',
			`SELECT (SELECT COUNT(*) FROM post_translations WHERE locale='${code}') pt, (SELECT COUNT(*) FROM series_translations WHERE locale='${code}') st`
		],
		{ cwd: root, encoding: 'utf8', timeout: 60_000 }
	);
	const r = JSON.parse(j.slice(j.indexOf('[')))[0]?.results?.[0] ?? {};
	const total = (r.pt ?? 0) + (r.st ?? 0);
	if (total > 0) {
		if (!purge)
			console.log(
				`ℹ 遠端尚有 ${total} 筆 ${code} 內容譯文——保留（重新 add 後即恢復可見）；要刪請加 --purge`
			);
		else {
			execFileSync(
				'pnpm',
				[
					'exec',
					'wrangler',
					'd1',
					'execute',
					'kikigaki',
					'--remote',
					'--command',
					`DELETE FROM post_translations WHERE locale='${code}'; DELETE FROM series_translations WHERE locale='${code}'`
				],
				{ cwd: root, stdio: 'inherit' }
			);
			console.log(`✓ 已刪除 ${total} 筆譯文`);
		}
	}
} catch {
	console.warn('⚠ 跳過遠端翻譯計數（無法連線或未登入）');
}
delete catalog[code];
writeFileSync(catalogPath, JSON.stringify(catalog, null, '\t') + '\n');
rmSync(join(root, 'messages', code + '.json'), { force: true });
// if locales.json contains this code → remove it (prevents broken builds)
const lp = join(root, 'config', 'locales.json');
const loc = JSON.parse(readFileSync(lp, 'utf8'));
if (loc.locales.includes(code)) {
	loc.locales = loc.locales.filter((l) => l !== code);
	writeFileSync(lp, JSON.stringify(loc, null, '\t') + '\n');
	console.log(`✓ 已同時由 config/locales.json 移除 ${code}`);
}
console.log(`✓ ${code} 已自目錄移除（字典檔刪除、catalog 清理）`);
