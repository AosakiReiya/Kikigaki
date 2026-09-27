/**
 * Change an existing user's (incl. admin) password
 *
 * Usage (interactive new-password prompt):
 *   node scripts/change-password.ts --local    apply to local D1
 *   node scripts/change-password.ts --remote   apply to remote D1
 *
 * Scripted (CI / tests):
 *   node scripts/change-password.ts --local --username=admin --password=********
 *
 * Password is Argon2id-hashed then UPDATE users.password_hash (params match src/lib/server/auth.ts).
 * Unlike create-admin: errors when the user does not exist — never auto-creates.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/server/password.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (target !== '--local' && target !== '--remote') {
	console.error(
		'用法：node scripts/change-password.ts --local | --remote [--username=x --password=y]'
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
const password = argValue('password') ?? (await ask('新密碼（≥ 8 碼）: '));

if (!username || password.length < 8) {
	console.error('✗ username 不能為空，密碼至少 8 碼');
	process.exit(1);
}

const passwordHash = await hashPassword(password);

// Verify the user exists first: fail if missing (literal semantics: change password ≠ create account)
const checkSql = `SELECT COUNT(*) AS c FROM users WHERE username = '${username.replaceAll("'", "''")}';`;
const output = execFileSync(
	'pnpm',
	['wrangler', 'd1', 'execute', 'kikigaki', target, '--command', checkSql, '--json'],
	{ cwd: root, encoding: 'utf8' }
);
// wrangler --json output is an outer array wrapping { results, success, meta }
const parsed = JSON.parse(output) as Array<{ results?: Array<{ c: number }> }>;
const count = parsed[0]?.results?.[0]?.c ?? 0;
if (count === 0) {
	console.error(`✗ 找不到使用者 "${username}"（本次操作不建立帳號）`);
	process.exit(1);
}

const safeUser = username.replaceAll("'", "''");
// Changing the password revokes all of the user's sessions (old logins die with the old password)
const sql = `UPDATE users SET password_hash = '${passwordHash}', role = IFNULL(role, 'admin') WHERE username = '${safeUser}';
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = '${safeUser}');
`;

const outDir = path.join(root, 'scripts', 'generated');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'change-password.sql');
writeFileSync(outFile, sql);

execFileSync('pnpm', ['wrangler', 'd1', 'execute', 'kikigaki', target, `--file=${outFile}`], {
	cwd: root,
	stdio: 'inherit'
});

console.log(`✓ 使用者 "${username}" 密碼已更新（${target.replace('--', '')}）`);
console.log('   請立即用新密碼登入並測試。');
