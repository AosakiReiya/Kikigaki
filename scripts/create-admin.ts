/**
 * Create / reset the admin account
 *
 * Usage (interactive credentials prompt):
 *   node scripts/create-admin.ts --local    apply to local D1
 *   node scripts/create-admin.ts --remote   apply to remote D1
 *
 * Scripted (CI / tests):
 *   node scripts/create-admin.ts --local --username=admin --password=********
 *
 * Password is Argon2id-hashed before writing (params match src/lib/server/auth.ts).
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/server/password.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (target !== '--local' && target !== '--remote') {
	console.error(
		'用法：node scripts/create-admin.ts --local | --remote [--username=x --password=y]'
	);
	process.exit(1);
}

// --- stdin line reader (supports pipes and interactive) ---
const pending: string[] = [];
let resolver: ((line: string) => void) | null = null;
let ended = false;
let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
	buffer += chunk;
	let idx: number;
	while ((idx = buffer.indexOf('\n')) !== -1) {
		const line = buffer.slice(0, idx).replace(/\r$/, '');
		buffer = buffer.slice(idx + 1);
		if (resolver) {
			const r = resolver;
			resolver = null;
			r(line);
		} else {
			pending.push(line);
		}
	}
});
process.stdin.on('end', () => {
	ended = true;
	if (resolver) {
		const r = resolver;
		resolver = null;
		r(buffer.replace(/\r$/, ''));
	}
});

function ask(q: string): Promise<string> {
	process.stdout.write(q);
	if (pending.length > 0) return Promise.resolve(pending.shift()!);
	if (ended) return Promise.resolve(buffer.replace(/\r$/, ''));
	return new Promise((resolve) => {
		resolver = resolve;
	});
}

function argValue(flag: string): string | undefined {
	const prefix = `--${flag}=`;
	return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const username = (argValue('username') ?? (await ask('username: '))).trim();
const password = argValue('password') ?? (await ask('password (≥ 8 碼): '));

if (!username || password.length < 8) {
	console.error('✗ username 不能為空，密碼至少 8 碼');
	process.exit(1);
}

const passwordHash = await hashPassword(password);

const id = randomUUID();
const now = new Date().toISOString();
const sql = `INSERT INTO users (id, username, password_hash, role, created_at)
VALUES ('${id}', '${username.replaceAll("'", "''")}', '${passwordHash}', 'admin', '${now}')
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;
`;

const outDir = path.join(root, 'scripts', 'generated');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'create-admin.sql');
writeFileSync(outFile, sql);

execFileSync('pnpm', ['wrangler', 'd1', 'execute', 'kikigaki', target, `--file=${outFile}`], {
	cwd: root,
	stdio: 'inherit'
});

console.log(`✓ 管理員 "${username}" 已寫入（${target.replace('--', '')}）`);
