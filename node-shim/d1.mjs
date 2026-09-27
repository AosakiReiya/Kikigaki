/**
 * Phase 77a — D1Database shim over better-sqlite3（self-host 用）。
 * 實作站內消費面：prepare().bind() → all/run/raw/first；batch()＝交易；exec/dump。
 */
import Database from 'better-sqlite3';

const normalize = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null));

class PreparedShim {
	constructor(db, sql) {
		this.db = db;
		this.stmt = db.prepare(sql);
		this.bound = [];
	}
	bind(...vals) {
		this.bound = vals;
		return this;
	}
	#args() {
		return this.bound.map(normalize);
	}
	async first(col) {
		const row = this.stmt.get(...this.#args());
		if (!row) return null;
		return col !== undefined ? row[col] : row;
	}
	async run() {
		const info = this.stmt.run(...this.#args());
		return {
			success: true,
			meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid), duration: 0 }
		};
	}
	async all() {
		const rows = this.stmt.all(...this.#args());
		return { success: true, results: rows, meta: { duration: 0, rows_read: rows.length } };
	}
	async raw() {
		this.stmt.raw(true);
		try {
			return this.stmt.all(...this.#args());
		} finally {
			this.stmt.raw(false);
		}
	}
	runSync() {
		if (this.stmt.reader) return { results: this.stmt.all(...this.#args()) };
		const info = this.stmt.run(...this.#args());
		return { meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
	}
}

export class D1SqliteShim {
	constructor(path) {
		this.db = new Database(path);
		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
	}
	prepare(sql) {
		return new PreparedShim(this.db, sql);
	}
	async batch(stmts) {
		const out = [];
		const tx = this.db.transaction(() => {
			for (const s of stmts) out.push(s.runSync());
		});
		tx();
		return out;
	}
	async exec(sql) {
		this.db.exec(sql);
		return { count: sql.split(';').filter((x) => x.trim()).length, duration: 0 };
	}
	async dump() {
		const { readFileSync, unlinkSync } = await import('node:fs');
		const tmp = `/tmp/d1-dump-${Date.now()}.sqlite`;
		this.db.exec(`VACUUM INTO '${tmp}'`);
		const buf = readFileSync(tmp);
		unlinkSync(tmp);
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
	}
	close() {
		this.db.close();
	}
}
