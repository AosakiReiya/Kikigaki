import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.resolve('scripts/cf-bootstrap.mjs');
const directories: string[] = [];
afterEach(() =>
	directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }))
);

function bootstrap({ established = false, credentials = 0, failBulk = false } = {}) {
	const directory = mkdtempSync(path.join(tmpdir(), 'kikigaki-bootstrap-'));
	directories.push(directory);
	writeFileSync(
		path.join(directory, 'wrangler.toml'),
		'name = "example-blog"\ndatabase_name = "example-blog"\ndatabase_id = "already-bound"\nbucket_name = "example-assets"\n'
	);
	const bin = path.join(directory, 'bin');
	mkdirSync(bin);
	const executable = path.join(bin, 'npx');
	writeFileSync(
		executable,
		`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
if (args.includes('whoami')) console.log('Logged in');
else if (args.includes('project') && args.includes('list')) console.log('example-blog');
else if (args.includes('secret') && args.includes('list')) console.log(${JSON.stringify(established ? '- AI_SECRET: Value Encrypted\n- CRON_SECRET: Value Encrypted' : '')});
else if (args.includes('execute')) console.log(JSON.stringify([{success:true,results:[{total:${credentials}}]}]));
else if (args.includes('bulk')) {
 const values = JSON.parse(fs.readFileSync(0,'utf8'));
 if (!Object.values(values).every(value => /^[a-f0-9]{64}$/.test(value))) process.exit(2);
 if (new Set(Object.values(values)).size !== Object.values(values).length) process.exit(2);
 if (${failBulk}) process.exit(1);
}
`
	);
	chmodSync(executable, 0o700);
	let output: string;
	let failed = false;
	try {
		output = execFileSync(process.execPath, [script, '--skip-deploy'], {
			cwd: directory,
			env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (error) {
		failed = true;
		const result = error as { stdout?: string; stderr?: string };
		output = String(result.stdout ?? '') + String(result.stderr ?? '');
	}
	const calls = readFileSync(path.join(directory, 'calls.jsonl'), 'utf8')
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line) as string[]);
	return { directory, output, failed, calls };
}

describe('bootstrap credential safety', () => {
	it('preserves established encrypted secrets without generating or overwriting keys', () => {
		const result = bootstrap({ established: true });
		expect(result.failed).toBe(false);
		expect(result.calls.some((args) => args.includes('bulk') || args.includes('execute'))).toBe(
			false
		);
	});
	it('stops before overwriting a master key when stored credentials exist', () => {
		const result = bootstrap({ credentials: 1 });
		expect(result.failed).toBe(true);
		expect(result.output).toContain('preserved-data rotation');
		expect(
			result.calls.some((args) => args.includes('bulk') || args.includes('scripts/seed-demo.mjs'))
		).toBe(false);
	});
	it('configures independent random secrets through stdin and keeps the recovery copy private', () => {
		const result = bootstrap();
		expect(result.failed).toBe(false);
		const file = path.join(result.directory, '.wrangler/security-setup/secrets.json');
		const secrets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
		expect(Object.keys(secrets).sort()).toEqual(['AI_SECRET', 'CRON_SECRET']);
		expect(secrets.AI_SECRET).not.toBe(secrets.CRON_SECRET);
		for (const value of Object.values(secrets)) {
			expect(value).toMatch(/^[a-f0-9]{64}$/);
			expect(result.output).not.toContain(value);
			expect(JSON.stringify(result.calls)).not.toContain(value);
		}
		expect(statSync(file).mode & 0o777).toBe(0o600);
		expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
	});
	it('stops before seeding or deploying if secret upload fails', () => {
		const result = bootstrap({ failBulk: true });
		expect(result.failed).toBe(true);
		expect(result.output).toContain('deployment stopped');
		expect(
			result.calls.some((args) => args.includes('scripts/seed-demo.mjs') || args.includes('deploy'))
		).toBe(false);
	});
});
