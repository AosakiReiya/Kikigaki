/**
 * Fill local D1 with enough mock posts/books to genuinely scroll /blog, /series and admin lists
 * (local only — never touches remote/production).
 *
 *   node scripts/seed-preview.ts --local --count=40 --books=8
 *   node scripts/seed-preview.ts --local --clean
 */
import { execFileSync } from 'node:child_process';

const target = process.argv[2];
if (target !== '--local') {
	console.error('僅支援 --local（遠端＝production 資料，拒絕污染）');
	process.exit(1);
}
const args = Object.fromEntries(
	process.argv.slice(3).map((a) => {
		const [, k, v] = /^--(\w+)(?:=(.*))?$/.exec(a) ?? [];
		return [k, v ?? true];
	})
);

const d1 = (sql: string) =>
	execFileSync(
		'pnpm',
		['exec', 'wrangler', 'd1', 'execute', 'kikigaki', '--local', '--command', sql],
		{ encoding: 'utf8', stdio: 'pipe' }
	);

if (args.clean) {
	d1(`DELETE FROM post_translations WHERE post_id LIKE 'post:prev-%';
DELETE FROM series_posts WHERE series_id LIKE 'series:prev-%';
DELETE FROM series_translations WHERE series_id LIKE 'series:prev-%';
DELETE FROM series WHERE slug LIKE 'prev-%';
DELETE FROM posts WHERE slug LIKE 'prev-%';`);
	console.log('✓ 已清除全部 prev-* mock 資料');
	process.exit(0);
}

const count = Math.max(0, Math.min(200, Number(args.count ?? 40)));
const books = Math.max(0, Math.min(40, Number(args.books ?? 8)));

let sql = '';
for (let i = 1; i <= count; i++) {
	const n = String(i).padStart(3, '0');
	sql += `INSERT OR REPLACE INTO posts (id,slug,type,published,pinned,views,created_at,updated_at,published_at) VALUES ('post:prev-${n}','prev-${n}','article',1,0,${(count - i) * 3},${Date.now()},${Date.now()},${Date.now() - i * 86400000});
INSERT OR REPLACE INTO post_translations (id,post_id,locale,title,summary,body,created_at,updated_at) VALUES ('pt:prev-${n}','post:prev-${n}','zh-tw','Mock 文章 ${n}','用於分頁與 load-more 測試。','內文 ${n}。\n\n## 小標甲\n\n段落。\n\n## 小標乙\n\n段落。',${Date.now()},${Date.now()});\n`;
}
for (let b = 1; b <= books; b++) {
	const bn = String(b).padStart(2, '0');
	sql += `INSERT OR REPLACE INTO series (id,slug,published,created_at,updated_at) VALUES ('series:prev-book-${bn}','prev-book-${bn}',1,${Date.now()},${Date.now()});
INSERT OR REPLACE INTO series_translations (id,series_id,locale,title,summary,created_at,updated_at) VALUES ('st:prev-book-${bn}','series:prev-book-${bn}','zh-tw','Mock 書 ${bn}','書架分頁測試用。',${Date.now()},${Date.now()});\n`;
	for (let m = 1; m <= 5; m++) {
		const idx = (((b - 1) * 5 + m - 1) % Math.max(1, count)) + 1;
		const n = String(idx).padStart(3, '0');
		sql += `INSERT OR REPLACE INTO series_posts (series_id,post_id,position,is_primary,created_at) VALUES ('series:prev-book-${bn}','post:prev-${n}',${m},0,${Date.now()});\n`;
	}
}
// Feed in batches (D1 --command has a size limit)
const chunks: string[] = [];
let cur = '';
for (const line of sql.split(/(?<=;\n)/)) {
	if (cur.length + line.length > 24000) {
		chunks.push(cur);
		cur = '';
	}
	cur += line;
}
if (cur) chunks.push(cur);
for (const c of chunks) d1(c);
console.log(
	`✓ 已灌入 local：${count} 篇 prev-* 文章、${books} 本 prev-book-* 書（清理：node scripts/seed-preview.ts --local --clean）`
);
