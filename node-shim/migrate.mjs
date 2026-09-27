/**
 * Phase 77a — 遷移器：把 migrations/*.sql（journal 順序）套到 self-host sqlite 檔。
 * 與 wrangler d1 同格式記錄於 d1_migrations 表（冪等：套過的跳過）。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dbPath = process.env.SELF_HOST_DB ?? './data/kikigaki.sqlite';
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
	name TEXT PRIMARY KEY,
	applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

const files = (await readdir('migrations')).filter((f) => f.endsWith('.sql')).sort();
const applied = new Set(
	db
		.prepare('SELECT name FROM d1_migrations')
		.all()
		.map((r) => r.name)
);
let n = 0;
for (const f of files) {
	const name = f.replace(/\.sql$/, '');
	if (applied.has(name)) continue;
	const sql = await readFile(path.join('migrations', f), 'utf8');
	const tx = db.transaction(() => {
		db.exec(sql);
		db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
	});
	tx();
	n++;
	console.log(`  applied ${name}`);
}
console.log(`[self-host] migrations: ${n} applied, ${files.length - n} already up-to-date`);
db.close();
