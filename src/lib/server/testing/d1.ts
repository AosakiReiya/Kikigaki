import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

/** Exercise real SQLite migrations, joins, FTS, JSON, and atomic batch rollback. */
export function d1Adapter(database: DatabaseSync): D1Database {
	function prepare(sql: string, params: SQLInputValue[] = []): D1PreparedStatement {
		return {
			bind: (...values: SQLInputValue[]) => {
				if (values.length > 100) throw new Error('D1 supports at most 100 bound parameters');
				return prepare(sql, values);
			},
			async first<T>(column?: string) {
				const row = database.prepare(sql).get(...params);
				return (row ? (column ? row[column] : row) : null) as T | null;
			},
			async raw<T>() {
				const statement = database.prepare(sql);
				statement.setReturnArrays(true);
				return statement.all(...params) as T[];
			},
			async all<T>() {
				return {
					success: true,
					results: database.prepare(sql).all(...params),
					meta: {}
				} as D1Result<T>;
			},
			async run<T>() {
				const result = database.prepare(sql).run(...params);
				return {
					success: true,
					results: [],
					meta: {
						changes: Number(result.changes),
						duration: 0,
						size_after: 0,
						rows_read: 0,
						rows_written: 0,
						last_row_id: Number(result.lastInsertRowid),
						changed_db: true
					}
				} as D1Result<T>;
			}
		} as D1PreparedStatement;
	}
	let queue = Promise.resolve();
	return {
		prepare,
		async batch<T>(statements: D1PreparedStatement[]) {
			const execute = async () => {
				database.exec('BEGIN');
				try {
					const results = [];
					for (const statement of statements) results.push(await statement.run<T>());
					database.exec('COMMIT');
					return results;
				} catch (error) {
					database.exec('ROLLBACK');
					throw error;
				}
			};
			const result = queue.then(execute);
			queue = result.then(
				() => undefined,
				() => undefined
			);
			return result;
		}
	} as D1Database;
}
