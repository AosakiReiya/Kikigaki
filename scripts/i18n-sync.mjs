#!/usr/bin/env node
/**
 * Language subset sync (required before deploy; first step of every CI build job)
 * Reads config/locales.json (or --locales a,b,c override, for GitHub Environment variables)
 * → validate → write locales/baseLocale into project.inlang/settings.json
 * --check: validate only, exit 1 on drift or invalid (CI quality gate)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSync, needsSync } from '../src/lib/i18n-config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const args = process.argv.slice(2);
const check = args.includes('--check');
const li = args.indexOf('--locales');
const cli =
	li >= 0
		? String(args[li + 1] ?? '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: null;

const catalog = readJson('config/locales-catalog.json');
const requested = cli ?? readJson('config/locales.json').locales;
const messages = readdirSync(join(root, 'messages'))
	.filter((f) => f.endsWith('.json'))
	.map((f) => f.replace(/\.json$/, ''));

const plan = planSync(catalog, requested, messages);
if (plan.errors.length) {
	console.error('✕ 語言設定無效：');
	for (const e of plan.errors) console.error('  - ' + e);
	process.exit(1);
}
for (const n of plan.notes) console.log('ℹ ' + n);

const settingsPath = join(root, 'project.inlang', 'settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
if (needsSync(settings, plan)) {
	if (check) {
		console.error(
			`✕ project.inlang/settings.json 與 config/locales.json 不同步（跑 pnpm i18n:sync）`
		);
		process.exit(1);
	}
	// precise text replacement (touch only the locales array and baseLocale string, preserving prettier formatting)
	const compact = `"locales": [${plan.locales.map((l) => `"${l}"`).join(', ')}]`;
	let text = readFileSync(settingsPath, 'utf8');
	text = text.replace(/"locales":\s*\[[^\]]*\]/, compact);
	text = text.replace(/"baseLocale":\s*"[^"]*"/, `"baseLocale": "${plan.base}"`);
	writeFileSync(settingsPath, text);
	console.log('✓ inlang locales → ' + plan.locales.join(', '));
} else {
	console.log('✓ 已同步：' + plan.locales.join(', '));
}
if (check) process.exit(0);
