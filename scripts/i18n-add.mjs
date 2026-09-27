#!/usr/bin/env node
/**
 * Add a language to the catalog (L1; not activated — activation = config/locales.json or GitHub Environment variable)
 * Usage:
 *   pnpm i18n:add <code> --ai --model gpt-x --base-url https://... --key $KEY
 *   pnpm i18n:add <code> --clone en        (no AI: copy an existing dictionary as draft)
 * AI uses OpenAI-compatible /chat/completions, batch-translating the 126 base-dictionary keys.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const code = args.find((a) => !a.startsWith('--'));
const flag = (n) => {
	const i = args.indexOf('--' + n);
	return i >= 0 ? args[i + 1] : undefined;
};
if (!code || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,4})*$/.test(code)) {
	console.error(
		'用法：pnpm i18n:add <code>（如 ko / pt-BR）--ai --model … --base-url … --key … 或 --clone <locale>'
	);
	process.exit(1);
}
const msgPath = join(root, 'messages', code + '.json');
if (existsSync(msgPath)) {
	console.error(`✕ messages/${code}.json 已存在`);
	process.exit(1);
}
const catalogPath = join(root, 'config', 'locales-catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const base = Object.entries(catalog).find(([, v]) => v.base)?.[0];
if (!base) {
	console.error('✕ catalog 無 base 母語標記');
	process.exit(1);
}
const source = JSON.parse(readFileSync(join(root, 'messages', base + '.json'), 'utf8'));
const keys = Object.keys(source).filter((k) => k !== '$schema');

let out;
const clone = flag('clone');
if (clone) {
	const src = JSON.parse(readFileSync(join(root, 'messages', clone + '.json'), 'utf8'));
	out = { $schema: source.$schema };
	for (const k of keys) out[k] = src[k] ?? source[k];
	console.log(`✓ 已從 ${clone} 複製草稿（請人工翻譯後再啟用）`);
} else if (args.includes('--ai')) {
	const baseUrl = (flag('base-url') ?? process.env.I18N_AI_BASE ?? '').replace(/\/$/, '');
	const key = flag('key') ?? process.env.I18N_AI_KEY ?? '';
	const model = flag('model') ?? process.env.I18N_AI_MODEL ?? '';
	if (!baseUrl || !key || !model) {
		console.error('✕ --ai 需 --base-url/--key/--model（或 I18N_AI_BASE/KEY/MODEL env）');
		process.exit(1);
	}
	out = { $schema: source.$schema };
	const BATCH = 40;
	for (let i = 0; i < keys.length; i += BATCH) {
		const chunk = Object.fromEntries(keys.slice(i, i + BATCH).map((k) => [k, source[k]]));
		const res = await fetch(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
			body: JSON.stringify({
				model,
				temperature: 0.2,
				messages: [
					{
						role: 'system',
						content: `你是 UI 本地化翻譯。把 JSON 的值翻成 ${code}（語言代碼），key 原樣保留，佔位符（{name} 等）保留，網站感/品牌語氣保持一致，僅輸出 JSON。`
					},
					{ role: 'user', content: JSON.stringify(chunk, null, 1) }
				]
			}),
			signal: AbortSignal.timeout(180_000)
		});
		if (!res.ok) {
			console.error(
				`✕ AI 批次 ${i / BATCH + 1} 失敗：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
			);
			process.exit(1);
		}
		const body = await res.json();
		const text = body.choices?.[0]?.message?.content ?? '';
		const m = text.match(/\{[\s\S]*\}/);
		let parsed;
		try {
			parsed = JSON.parse(m[0]);
		} catch {
			console.error(`✕ AI 批次 ${i / BATCH + 1} 回傳非 JSON`);
			process.exit(1);
		}
		for (const k of Object.keys(chunk))
			out[k] = typeof parsed[k] === 'string' && parsed[k] ? parsed[k] : chunk[k];
		console.log(`  … ${Math.min(i + BATCH, keys.length)}/${keys.length} 鍵`);
	}
} else {
	console.error('✕ 需 --ai 或 --clone <locale>');
	process.exit(1);
}

writeFileSync(msgPath, JSON.stringify(out, null, '\t') + '\n');
// add catalog entry (label = language self-designation; hreflang/bcp47 default to code, review flagged)
const dn = new Intl.DisplayNames([code], { type: 'language' });
let label = code;
try {
	label = dn.of(code.split('-')[0]) ?? code;
} catch {
	/* unknown code falls back to as-is */
}
catalog[code] = { label, hreflang: code.split('-')[0], bcp47: code, needsReview: true };
writeFileSync(catalogPath, JSON.stringify(catalog, null, '\t') + '\n');
console.log(`✓ messages/${code}.json（${keys.length} 鍵）＋ catalog entry（label=${label}）`);
console.log(
	'下一步：1) 人工審查字典與 catalog 的 hreflang/bcp47 2) 要啟用就把 ' +
		code +
		' 加進 config/locales.json（或在 GitHub Environment 變數 I18N_LOCALES）'
);
