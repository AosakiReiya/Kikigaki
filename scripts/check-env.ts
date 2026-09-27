/**
 * Pre-deploy check: Turnstile configuration completeness.
 *
 * Usage: node scripts/check-env.ts
 *
 * Missing sitekey / secret exits 1 to avoid a silent "fail open" launch.
 * Note: production TURNSTILE_SECRET is a Pages dashboard env var (unreadable locally);
 * the real protection is runtime fail-closed (production missing secret → comment POST 403).
 * This only ensures the developer's local env is configured so keys aren't forgotten.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile(file: string): Record<string, string> {
	const full = path.join(root, file);
	const out: Record<string, string> = {};
	if (!existsSync(full)) return out;
	for (const line of readFileSync(full, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m) continue;
		const val = m[2]
			.replace(/^["']|["']$/g, '')
			.split(/\s+#/)[0]
			.trim();
		out[m[1]] = val;
	}
	return out;
}

const env = readEnvFile('.env');
const devVars = readEnvFile('.dev.vars');

const siteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY || env.PUBLIC_TURNSTILE_SITE_KEY || '';
const secret = process.env.TURNSTILE_SECRET || devVars.TURNSTILE_SECRET || '';

const problems: string[] = [];
if (!siteKey) problems.push('PUBLIC_TURNSTILE_SITE_KEY 未設定（.env）');
if (!secret) problems.push('TURNSTILE_SECRET 未設定（.dev.vars 或 Pages env var）');

if (problems.length > 0) {
	console.error('❌ Turnstile 部署前檢查失敗：');
	for (const p of problems) console.error(`   - ${p}`);
	console.error('（正式環境缺 secret 時，評論 POST 會 fail-closed 403）');
	process.exit(1);
}

console.log('✓ Turnstile sitekey + secret 已設定');
