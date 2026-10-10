/** Read-only logical backup, including an FTS rebuild and a verified local restore. */
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const literal = (value) => {
	if (value === null) return 'NULL';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('Non-finite database value');
		return String(value);
	}
	if (Array.isArray(value)) return `X'${Buffer.from(value).toString('hex')}'`;
	return `'${String(value).replaceAll("'", "''")}'`;
};

export function backupD1({ database, remote, output }) {
	const destination = path.resolve(output);
	mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
	const query = (sql) => {
		let text;
		try {
			text = execFileSync(
				process.execPath,
				[
					path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
					'd1',
					'execute',
					database,
					remote ? '--remote' : '--local',
					'--command',
					sql,
					'--json'
				],
				{
					cwd: root,
					encoding: 'utf8',
					maxBuffer: 64 * 1024 * 1024,
					stdio: ['pipe', 'pipe', 'pipe']
				}
			);
		} catch {
			throw new Error('D1 backup query failed; credential-bearing output has been suppressed.');
		}
		const result = JSON.parse(text);
		if (result.some((entry) => !entry.success)) throw new Error('D1 backup query failed');
		return result.flatMap((entry) => entry.results);
	};
	const schema = query(
		"SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY rowid"
	);
	const virtual = schema.filter((entry) => /^CREATE VIRTUAL TABLE/i.test(entry.sql));
	if (virtual.some((entry) => !/\bUSING fts5\b/i.test(entry.sql)))
		throw new Error('Unsupported virtual table; use D1 Time Travel instead.');
	const ordinary = schema.filter(
		(entry) =>
			entry.type === 'table' &&
			!virtual.some((table) => entry.name === table.name || entry.name.startsWith(table.name + '_'))
	);
	const records = query(
		ordinary
			.map(
				(table) =>
					`SELECT ${literal(table.name)} AS __backup_table, * FROM ${identifier(table.name)}`
			)
			.join(';')
	);
	const expected = query(
		ordinary
			.map(
				(table) =>
					`SELECT ${literal(table.name)} AS name, count(*) AS total FROM ${identifier(table.name)}`
			)
			.join(';')
	);
	const lines = [
		'-- Read-only D1 logical backup. Restore to an empty database.',
		'PRAGMA defer_foreign_keys=TRUE;'
	];
	for (const table of ordinary) lines.push(table.sql + ';');
	const counts = new Map(ordinary.map((table) => [table.name, 0]));
	for (const record of records) {
		const { __backup_table: table, ...values } = record;
		if (!counts.has(table)) throw new Error('Unexpected backup table');
		counts.set(table, counts.get(table) + 1);
		lines.push(
			`INSERT INTO ${identifier(table)} (${Object.keys(values).map(identifier).join(',')}) VALUES (${Object.values(values).map(literal).join(',')});`
		);
	}
	for (const { name, total } of expected) {
		if (counts.get(name) !== total)
			throw new Error('Source row counts changed or results were truncated; retry the backup.');
	}
	for (const table of virtual) {
		lines.push(
			table.sql + ';',
			`INSERT INTO ${identifier(table.name)} (${identifier(table.name)}) VALUES ('rebuild');`
		);
	}
	for (const entry of schema.filter((entry) => entry.type !== 'table')) lines.push(entry.sql + ';');
	const sql = lines.join('\n') + '\n';
	const restored = new DatabaseSync(':memory:');
	try {
		restored.exec('PRAGMA foreign_keys=ON; BEGIN');
		restored.exec(sql);
		restored.exec('COMMIT');
		if (restored.prepare('PRAGMA foreign_key_check').all().length)
			throw new Error('Backup failed foreign key verification');
		for (const [table, count] of counts) {
			if (
				restored.prepare(`SELECT count(*) AS count FROM ${identifier(table)}`).get().count !== count
			)
				throw new Error('Backup row-count mismatch');
		}
		if (restored.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
			throw new Error('Backup failed integrity verification');
	} finally {
		restored.close();
	}
	writeFileSync(destination, sql, { mode: 0o600 });
	chmodSync(destination, 0o600);
	return { tables: counts.size, rows: records.length, bytes: Buffer.byteLength(sql) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	const output = args[args.indexOf('--output') + 1];
	if (
		!args.includes('--output') ||
		!output ||
		(!args.includes('--remote') && !args.includes('--local'))
	)
		throw new Error(
			'Usage: node scripts/backup-d1.mjs --remote|--local --output <private-file> [--database <name>]'
		);
	const database = args.includes('--database')
		? args[args.indexOf('--database') + 1]
		: /^database_name\s*=\s*"([^"]+)"/m.exec(
				readFileSync(path.join(root, 'wrangler.toml'), 'utf8')
			)?.[1];
	if (!database) throw new Error('Configure the D1 database or pass --database.');
	console.log(
		'Verified private D1 backup:',
		backupD1({ database, remote: args.includes('--remote'), output })
	);
}
