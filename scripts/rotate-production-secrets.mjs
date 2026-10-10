/** Prepare, apply, or verify a backed-up rotation without printing credential values. */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptSecret, encryptSecret, isEncrypted } from '../src/lib/server/secrets.ts';
import { backupD1 } from './backup-d1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.wrangler/security-release');
const planFile = path.join(directory, 'rotation-plan.json');
const mode = process.argv[2];
const config = readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const database = /^database_name\s*=\s*"([^"]+)"/m.exec(config)?.[1];
const project = /^name\s*=\s*"([^"]+)"/m.exec(config)?.[1];
if (!database || !project) throw new Error('Configure the D1 database and Pages project first.');
if (!['prepare', 'apply', 'verify'].includes(mode)) {
	throw new Error('Usage: node scripts/rotate-production-secrets.mjs prepare|apply|verify');
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);

function wrangler(args, input) {
	return execFileSync(
		process.execPath,
		[path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args],
		{
			cwd: root,
			input,
			encoding: 'utf8',
			maxBuffer: 16 * 1024 * 1024,
			env: {
				...process.env,
				WRANGLER_LOG_PATH: path.join(directory, 'wrangler.log'),
				WRANGLER_SEND_METRICS: 'false'
			},
			stdio: ['pipe', 'pipe', 'pipe']
		}
	);
}
function query(sql) {
	const results = JSON.parse(
		wrangler(['d1', 'execute', database, '--remote', '--command', sql, '--json'])
	);
	if (results.some((result) => !result.success)) throw new Error('D1 query failed');
	return results.flatMap((result) => result.results);
}
const readCredentials = () =>
	query(
		"SELECT 'ai_providers' AS tab, 'api_key_enc' AS col, 'id' AS idcol, id, api_key_enc AS value FROM ai_providers WHERE api_key_enc != '' " +
			"UNION ALL SELECT 'mcp_servers', 'headers_enc', 'id', id, headers_enc FROM mcp_servers WHERE headers_enc != '' " +
			"UNION ALL SELECT 'site_settings', 'value', 'key', key, value FROM site_settings WHERE key IN ('email_api_enc','email_secrets_enc','gsc_sa_enc') AND value != ''"
	);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const writePrivate = (name, contents) => {
	const file = path.join(directory, name);
	writeFileSync(file, contents, { mode: 0o600 });
	chmodSync(file, 0o600);
	return file;
};
const update = (row, from, to) =>
	`UPDATE ${row.tab} SET ${row.col}=${quote(to)} WHERE ${row.idcol}=${quote(row.id)} AND ${row.col}=${quote(from)};`;

if (mode === 'prepare') {
	const old = JSON.parse(readFileSync(path.join(directory, 'old-ai-secret.json'), 'utf8')).secret;
	if (!old)
		throw new Error('The previous master key is required; preparation never changes production.');
	const next = randomBytes(32).toString('hex');
	const rows = [];
	for (const row of readCredentials()) {
		const plain = isEncrypted(row.value) ? await decryptSecret(old, row.value) : row.value;
		if (plain === null) throw new Error(`Cannot decrypt ${row.tab}/${row.id}; no changes applied.`);
		const value = await encryptSecret(next, plain);
		if ((await decryptSecret(next, value)) !== plain)
			throw new Error('Rotation verification failed');
		rows.push({ ...row, next: value });
	}
	const backup = path.join(directory, 'production-before-security.sql');
	const savedLog = process.env.WRANGLER_LOG_PATH;
	process.env.WRANGLER_LOG_PATH = path.join(directory, 'wrangler.log');
	const snapshot = backupD1({ database, remote: true, output: backup });
	if (savedLog === undefined) delete process.env.WRANGLER_LOG_PATH;
	else process.env.WRANGLER_LOG_PATH = savedLog;
	writePrivate('backup-manifest.json', JSON.stringify(snapshot));
	writePrivate('rotation-plan.json', JSON.stringify({ database, project, next, rows }, null, 2));
	writePrivate(
		'secrets.json',
		JSON.stringify({ AI_SECRET: next, CRON_SECRET: randomBytes(32).toString('hex') })
	);
	writePrivate('rotate.sql', rows.map((row) => update(row, row.value, row.next)).join('\n') + '\n');
	writePrivate(
		'rollback.sql',
		rows.map((row) => update(row, row.next, row.value)).join('\n') + '\n'
	);
	console.log(
		`Prepared ${rows.length} encrypted credential(s) and a private D1 backup. Production is unchanged.`
	);
} else {
	const plan = JSON.parse(readFileSync(planFile, 'utf8'));
	if (plan.database !== database || plan.project !== project)
		throw new Error('Rotation target mismatch');
	if (mode === 'apply') {
		if (!process.argv.includes('--confirm-production'))
			throw new Error('Apply requires --confirm-production after release approval.');
		const current = readCredentials();
		if (
			current.length !== plan.rows.length ||
			current.some(
				(row) =>
					!plan.rows.some(
						(saved) =>
							saved.tab === row.tab &&
							saved.id === row.id &&
							[saved.value, saved.next].includes(row.value)
					)
			)
		) {
			throw new Error(
				'Credentials changed since preparation; prepare a fresh plan before applying.'
			);
		}
		if (plan.rows.length)
			wrangler([
				'd1',
				'execute',
				database,
				'--remote',
				'--file',
				path.join(directory, 'rotate.sql'),
				'-y'
			]);
		wrangler([
			'pages',
			'secret',
			'bulk',
			path.join(directory, 'secrets.json'),
			'--project-name',
			project
		]);
		console.log(
			'Production credentials resealed and Pages secrets configured. Deploy the approved build immediately.'
		);
	}
	const rows = readCredentials();
	if (rows.length !== plan.rows.length) throw new Error('Credential count changed');
	for (const row of rows) {
		if (!isEncrypted(row.value) || (await decryptSecret(plan.next, row.value)) === null)
			throw new Error(`Credential verification failed: ${row.tab}/${row.id}`);
	}
	console.log(`Verified ${rows.length} preserved credential(s) with the new master key.`);
}
