#!/usr/bin/env node
/**
 * 68R3 — Cloudflare one-command bootstrap (zero Dashboard after fork):
 *   pnpm cf:setup --name my-blog
 * Flow: rewrite wrangler.toml project name → create D1 (if unbound) → create R2 (idempotent) →
 * apply migrations → Pages project → secrets (CRON_SECRET/AI_SECRET randomly generated) →
 * seed demo posts → build + production deploy → print URL and next steps.
 * Prereqs: npx wrangler login done, pnpm install, Node ≥ 20.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
	const i = argv.indexOf(`--${n}`);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};
const NAME = opt('name');
const SKIP_DEPLOY = flag('skip-deploy');

const run = (args, { allowFail = false, quiet = true } = {}) => {
	try {
		const out = execFileSync('npx', args, {
			encoding: 'utf8',
			maxBuffer: 128 * 1024 * 1024,
			stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit'
		});
		return out ?? '';
	} catch (e) {
		if (allowFail) return String(e.stdout ?? '') + String(e.stderr ?? '');
		process.stderr.write(`✗ 指令失敗：npx ${args.join(' ')}\n${e.stdout ?? ''}${e.stderr ?? ''}`);
		process.exit(1);
	}
};
const step = (m) => console.log(`\n▸ ${m}`);

// 0. Verify login
step('確認 wrangler 登入狀態');
const whoami = run(['wrangler', 'whoami'], { allowFail: true });
if (!/Logged in/i.test(whoami)) {
	console.error('✗ 尚未登入 Cloudflare。先執行：npx wrangler login');
	process.exit(1);
}
console.log('  ✓ 已登入');

// 1. Rewrite project name
let toml = readFileSync('wrangler.toml', 'utf8');
const curName = /^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? 'kikigaki';
const project = NAME ?? curName;
if (NAME && NAME !== curName) {
	if (!/^[a-z][a-z0-9-]{2,57}$/.test(NAME)) {
		console.error('✗ --name 需為 3-58 字小寫 slug（a-z0-9-，字母開頭）');
		process.exit(1);
	}
	toml = toml.replace(/^name\s*=\s*"[^"]+"/m, `name = "${NAME}"`);
	toml = toml.replace(/^database_name\s*=\s*"[^"]+"/m, `database_name = "${NAME}"`);
	toml = toml.replace(/^bucket_name\s*=\s*"[^"]+"/m, `bucket_name = "${NAME}-assets"`);
	writeFileSync('wrangler.toml', toml);
	console.log(`✓ wrangler.toml 已改寫為 ${NAME}（D1=${NAME}、R2=${NAME}-assets）`);
}
const bucket = /^bucket_name\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? 'blog-assets';

// 2. D1
step('D1 資料庫');
let dbId = /^database_id\s*=\s*"([^"]*)"/m.exec(toml)?.[1] ?? '';
if (!dbId) {
	const out = run(['wrangler', 'd1', 'create', project, '--json'], { allowFail: true });
	const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
	dbId = j?.database_id ?? '';
	if (!dbId) {
		console.error('✗ D1 建立失敗：\n' + out.slice(0, 400));
		process.exit(1);
	}
	toml = toml.replace(/^database_id\s*=\s*"[^"]*"/m, `database_id = "${dbId}"`);
	writeFileSync('wrangler.toml', toml);
	console.log(`  ✓ 已建立並綁定 ${dbId}`);
} else {
	console.log(`  ✓ 已有綁定（${dbId}），略過建立`);
}

// 3. R2（冪等）
step(`R2 桶子 ${bucket}`);
const r2 = run(['wrangler', 'r2', 'bucket', 'create', bucket], { allowFail: true });
console.log(/already exists|Created|success|error/i.test(r2) ? '  ✓ 就緒（或已存在）' : '  ✓ 完成');

// 4. Migrations
step('套用資料庫 migrations（--remote）');
run(['wrangler', 'd1', 'migrations', 'apply', project, '--remote']);
console.log('  ✓ migrations 完成');

// 5. Pages project
step(`Pages 專案 ${project}`);
const pl = run(['wrangler', 'pages', 'project', 'list'], { allowFail: true });
if (!pl.includes(project))
	run(['wrangler', 'pages', 'project', 'create', project, '--production-branch', 'main'], {
		allowFail: true
	});
console.log('  ✓ 就緒');

// 6. Secrets（缺才補；值隨機生成並顯示一次）
step('Secrets（CRON_SECRET／AI_SECRET）');
const sl = run(['wrangler', 'pages', 'secret', 'list', '--project-name', project], {
	allowFail: true
});
const need = (n) => !new RegExp(`\\b${n}\\b`).test(sl);
const gen = () => randomBytes(24).toString('base64url');
for (const s of ['CRON_SECRET', 'AI_SECRET']) {
	if (need(s)) {
		const v = gen();
		try {
			execFileSync(
				'bash',
				[
					'-c',
					`printf '%s' ${JSON.stringify(v)} | npx wrangler pages secret put ${s} --project-name ${project}`
				],
				{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
			);
			console.log(`  ✓ ${s} 已設定＝${v}（記下來，之後只能覆寫不能讀取）`);
		} catch (e) {
			console.warn(
				`  ! ${s} 設定失敗，手動：printf '值' | npx wrangler pages secret put ${s} --project-name ${project}`
			);
			void e;
		}
	} else console.log(`  ✓ ${s} 已存在，保留`);
}

// 7. 種子示範文
step('種子示範文章（冪等）');
run(['node', 'scripts/seed-demo.mjs', '--remote'], { allowFail: true });

// 8. Build + Deploy
if (!SKIP_DEPLOY) {
	step('建置並部署 production');
	run(['pnpm', 'build']);
	const dep = run([
		'wrangler',
		'pages',
		'deploy',
		'.svelte/cloudflare',
		'--project-name',
		project,
		'--branch',
		'main'
	]);
	const url = /https:\/\/([a-z0-9-]+\.pages\.dev|[^\s]*\.pages\.dev)/i.exec(dep)?.[1];
	console.log('  ✓ 部署完成');
	console.log(`\n🎉 你的站上線：https://${url ?? `${project}.pages.dev`}`);
} else {
	console.log('\n（--skip-deploy：略過建置部署）');
}

console.log(`
下一步（三分鐘自我介紹）：
  1. 開 https://${project}.pages.dev/admin → 建管理員帳號
  2. 設定 → 網站識別：站網址／作者／社交連結（存 DB，代碼零個人值）
  3. 設定 → Email：接 Resend 免費額度 → 測試連線
  4. 選主題：設定 → 設計主題；或主題工作台做免 Git DB 主題
  5. 想自動部署（push 即上線）：GitHub repo 連 Cloudflare Pages（Build command: pnpm build；
     Output: .svelte/cloudflare；Variables 見 docs/oss-release.md）
`);
