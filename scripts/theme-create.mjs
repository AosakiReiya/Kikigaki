#!/usr/bin/env node
/**
 * Phase 78b — theme scaffold: `node scripts/theme-create.mjs <id> [--clone abstract|terminal] [options]`
 *
 * Generates three registrations (marker injection) + optional structural pack directory:
 *   - src/lib/themes/index.ts   THEME_IDS + themes manifest
 *   - src/lib/themes/registry.ts  pack import/entry (only when --clone has a pack)
 *   - src/lib/styles/themes.css   token block (skeleton copied from the clone source)
 *   - src/lib/themes/packs/<id>/  component pack (whole-directory copy when --clone <packed theme>)
 * Then: edit packs/<id>/*.svelte layout + themes.css palette → pnpm check → verify via admin preview switch.
 */
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const id = argv[0];
if (!id || id.startsWith('--'))
	die(
		'用法：node scripts/theme-create.mjs <id> [--clone <pack>] [--label 名] [--desc 說明] [--swatch a,b,c,d] [--fade] [--preloader]'
	);
if (!/^[a-z][a-z0-9-]{1,24}$/.test(id)) die(`id 需為小寫 slug（a-z0-9-，開頭字母）：${id}`);

const flag = (name, dflt) => {
	const hit = argv.find((a) => a.startsWith(`--${name}=`));
	if (hit) return hit.slice(name.length + 3);
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const bool = (name) => argv.includes(`--${name}`);

const clone = flag('clone', null);
const label = flag('label', id.charAt(0).toUpperCase() + id.slice(1));
const desc = flag('desc', `${label} 主題（theme-create 生成骨架——改 packs/tokens 成形）`);
const swatch = (flag('swatch', '#d4ff3f,#141414,#faf9f6,#64751a') || '')
	.split(',')
	.map((x) => x.trim());
const fade = bool('fade');
const preloader = bool('preloader');

const IDXS = 'src/lib/themes/index.ts';
const REG = 'src/lib/themes/registry.ts';
const CSS = 'src/lib/styles/themes.css';

// 0) Conflict & anchor pre-checks (all must pass before writing; zero side effects on failure)
for (const [mf, marker] of [
	[IDXS, 'theme-scaffold:entries'],
	[REG, 'theme-scaffold:packs'],
	[CSS, 'theme-scaffold:css']
]) {
	if (!read(abs(mf)).includes(marker))
		die(`腳本錨點缺失：${mf}（${marker}）——標記註解不可手動刪改`);
}
if (clone && !existsSync(abs('src/lib/themes/packs', clone)))
	die(`clone 來源不存在：packs/${clone}`);
const idxSrc = read(abs(IDXS));
if (new RegExp(`'${id}'`).test(idxSrc.match(/theme-scaffold:ids[^\n]*\n[^\n]*/)?.[0] ?? ''))
	die(`主題 ${id} 已存在`);
if (existsSync(abs('src/lib/themes/packs', id))) die(`packs/${id} 目錄已存在`);

// 1) Copy the structural pack (--clone with a packed source)
const PACKED = ['abstract', 'terminal'];
const packDir = abs('src/lib/themes/packs', id);
if (clone) {
	if (!PACKED.includes(clone))
		die(`--clone 僅支援有結構包的主題：${PACKED.join('|')}（token-only 主題請不帶 --clone）`);
	cpSync(abs('src/lib/themes/packs', clone), packDir, { recursive: true });
	// Rewrite in-directory imports: 'packs/<clone>' absolute paths → this pack; '../../..' relative levels unchanged
	const walk = (dir) => {
		for (const f of readdirSync(dir, { withFileTypes: true })) {
			const fp = path.join(dir, f.name);
			if (f.isDirectory()) walk(fp);
			else if (/\.(svelte|ts)$/.test(f.name)) {
				let t = read(fp);
				t = t.replaceAll(`$lib/themes/packs/${clone}`, `$lib/themes/packs/${id}`);
				write(fp, t);
			}
		}
	};
	walk(packDir);
	// index.ts: rename pack variable
	const camel = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
	write(
		path.join(packDir, 'index.ts'),
		read(path.join(packDir, 'index.ts'))
			.replace(/export const \w+Pack/, `export const ${camel}Pack`)
			.replace(/: ThemePack = \{/, ': ThemePack = {')
	);
	var camelPack = camel;
}

// 2) index.ts injection: THEME_IDS + manifest entry
{
	let s = read(abs(IDXS));
	s = s.replace(
		/(\/\/ theme-scaffold:ids[^\n]*\nexport const THEME_IDS = \[[^\]]*)\]/,
		`$1, '${id}']`
	);
	const transition = fade
		? "'fade'"
		: clone === 'terminal' || clone === 'minimal'
			? "'fade'"
			: "'curtain'";
	const behavior = `{ transition: ${transition}, preloader: ${preloader ? 'true' : 'false'}, staggerScale: ${clone === 'terminal' ? 0.8 : clone === 'minimal' ? 0.6 : 1} }`;
	const entry = `\t'${id}': {\n\t\tid: '${id}',\n\t\tlabel: ${JSON.stringify(label)},\n\t\tdescription: ${JSON.stringify(desc)},\n\t\tswatches: [${swatch.map((c) => JSON.stringify(c)).join(', ')}],\n\t\tbehavior: ${behavior}\n\t},\n`;
	// if the previous entry ends the array (no comma), add one
	s = s.replace(/(\n\t\}\n)(\t\/\/ theme-scaffold:entries)/, '$1,,$2'.replace(',,', ','));
	s = s.replace(/\n\t\}\n(\t\/\/ theme-scaffold:entries)/, '\n\t},\n$1');
	s = s.replace(/(\t\/\/ theme-scaffold:entries[^\n]*\n)/, entry + '$1');
	write(abs(IDXS), s);
}

// 3) registry.ts injection (when packed)
if (clone) {
	let s = read(abs(REG));
	// 79a-slim: packs use lazy loaders (no longer statically imported into the shared chunk)
	s = s.replace(
		/(\t\/\/ theme-scaffold:packs)/,
		`\t'${id}': async () => (await import('./packs/${id}')).${camelPack}Pack,\n$1`
	);
	// self-heal: add missing trailing comma on the previous pack line (Pack lines wrap into indented content)
	s = s.replace(/(Pack\n)(\t)/g, '$1,$2');
	write(abs(REG), s);
}

// 4) themes.css injection: copy ALL rule blocks of the source theme (incl. derived selectors)
{
	let s = read(abs(CSS));
	const srcTheme = clone ?? 'minimal';
	const blocks =
		s.match(new RegExp(`html\\[data-ui-theme='${srcTheme}'\\][^{]*\\{[^}]*\\}`, 'g')) ?? [];
	const block = blocks.length
		? blocks
				.map((b) => b.replaceAll(`data-ui-theme='${srcTheme}'`, `data-ui-theme='${id}'`))
				.join('\n\n')
		: `html[data-ui-theme='${id}'] {\n\t/* TODO：參考其他主題區塊填入令牌（--color-accent 等） */\n}`;
	s = s.replace(/(\/\* theme-scaffold:css[^\n]*\n?)/, `$1\n${block}\n`);
	write(abs(CSS), s);
}

const { execFileSync } = await import('node:child_process');
const fmt = (target) => {
	for (const [cmd, args] of [
		['pnpm', ['exec', 'prettier', '--write', target]],
		['npx', ['prettier', '--write', target]]
	]) {
		try {
			execFileSync(cmd, args, { cwd: ROOT, stdio: 'ignore' });
			return true;
		} catch {
			// try next runner
		}
	}
	return false;
};
try {
	if (!fmt(IDXS) || !fmt(REG) || !fmt(CSS)) throw new Error('no-formatter');
	if (clone) fmt(`src/lib/themes/packs/${id}`);
} catch {
	console.log('   （prettier 未跑成：請手動 pnpm exec prettier --write src/lib/themes）');
}

console.log(
	`✅ 主題骨架完成：${id}${clone ? `（結構包複製自 ${clone}）` : '（token-only，版面沿用 abstract）'}`
);
console.log(`   下一步：`);
if (clone) console.log(`   1. 改 src/lib/themes/packs/${id}/*.svelte 版面`);
console.log(`   2. 改 src/lib/styles/themes.css 的 [data-ui-theme='${id}'] 色盤`);
console.log(`   3. pnpm check && pnpm dev → /admin/settings 切換預覽`);

function abs(...segs) {
	return path.join(ROOT, ...segs);
}
function read(f) {
	return readFileSync(f, 'utf8');
}
function write(f, t) {
	writeFileSync(f, t);
}
function die(msg) {
	console.error(`✗ ${msg}`);
	process.exit(1);
}
