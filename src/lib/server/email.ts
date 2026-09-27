/**
 * Phase 67a — Email Provider Adapter (WP Mail SMTP style)
 *
 * Platform constraint: Workers have no native SMTP; every provider is an HTTPS API (Free-plan compatible).
 * Cloudflare Email Sending needs Workers Paid (env.EMAIL binding); flagged in the UI.
 * Credentials stored AES-GCM encrypted in site_settings (master key reuses env.AI_SECRET); the frontend only ever sees the last four.
 */
import { getDb } from '$lib/server/db';
import { siteSettings } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';
import { decryptSecret, encryptSecret } from '$lib/server/secrets';
import { getSettings } from '$lib/server/settings';

export type EmailProvider = 'resend' | 'smtp2go' | 'postmark' | 'mailgun' | 'ses' | 'cloudflare';

export const PROVIDERS: { id: EmailProvider; label: string; note: string; paid?: boolean }[] = [
	{ id: 'resend', label: 'Resend', note: 'API Key；免費 3,000 封/月（100/天）——開源預設推薦' },
	{ id: 'smtp2go', label: 'SMTP2GO', note: 'API Key；免費 1,000 封/月' },
	{ id: 'postmark', label: 'Postmark', note: 'Server Token；免費試用 100 封/月，事務信口碑' },
	{ id: 'mailgun', label: 'Mailgun', note: 'API Key＋Domain；試用量價' },
	{ id: 'ses', label: 'Amazon SES', note: 'Access Key＋Secret＋Region；按量最便宜，需 AWS 帳號' },
	{
		id: 'cloudflare',
		label: 'Cloudflare Email Sending',
		note: '免憑證（binding）；需 Workers Paid $5/月',
		paid: true
	}
];

const KEY_PROVIDER = 'email_provider';
const KEY_API = 'email_api_enc'; // AES-GCM: resend/postmark/smtp2go key, mailgun key, ses accessKey (secret folded in)
const KEY_FROM = 'email_from';
const KEY_FROM_NAME = 'email_from_name';
const KEY_DOMAIN = 'email_domain'; // mailgun
const KEY_REGION = 'email_region'; // ses
const KEY_SECRETS_ENC = 'email_secrets_enc'; // multi-field credential JSON (ses secret etc.) after encryption
const KEY_DISABLED = 'email_disabled'; // kill switch
const KEY_ADMIN_NOTIFY = 'email_admin_notify'; // owner new-comment notify address (Phase 71)

export interface EmailConfig {
	provider: EmailProvider;
	from: string;
	fromName: string;
	/** configured-or-not + last four (plaintext never returned) */
	hasKey: boolean;
	keyTail: string;
	domain?: string;
	region?: string;
	adminNotify: string;
	disabled: boolean;
}

export interface EmailSendInput {
	to: string;
	subject: string;
	html: string;
	text?: string;
	template?: string;
}

export type EmailResult = { ok: true; id?: string } | { ok: false; error: string };

/* ── config read/write (credentials encrypted) ────────────────────────────────────────────── */

async function readKeys(db: D1Database, keys: readonly string[]): Promise<Map<string, string>> {
	const kit = getDb(db);
	const all = await kit.select().from(siteSettings);
	const m = new Map<string, string>();
	for (const row of all) if (keys.includes(row.key) && row.value) m.set(row.key, row.value);
	return m;
}

/** provider + display config (no plaintext credentials) */
export async function getEmailConfig(db: D1Database): Promise<EmailConfig> {
	const m = await readKeys(db, [
		KEY_PROVIDER,
		KEY_API,
		KEY_FROM,
		KEY_FROM_NAME,
		KEY_DOMAIN,
		KEY_REGION,
		KEY_SECRETS_ENC,
		KEY_DISABLED,
		KEY_ADMIN_NOTIFY,
		'email_key_tail'
	]);
	const provider = (m.get(KEY_PROVIDER) ?? 'resend') as EmailProvider;
	const enc = m.get(KEY_API) ?? '';
	return {
		provider,
		from: m.get(KEY_FROM) ?? '',
		fromName: m.get(KEY_FROM_NAME) ?? '',
		hasKey: !!enc,
		keyTail: m.get('email_key_tail') ?? '',
		domain: m.get(KEY_DOMAIN) ?? undefined,
		region: m.get(KEY_REGION) ?? undefined,
		adminNotify: m.get(KEY_ADMIN_NOTIFY) ?? '',
		disabled: m.get(KEY_DISABLED) === '1'
	};
}

export interface EmailConfigInput {
	provider?: EmailProvider;
	apiKey?: string; // empty = untouched; 'CLEAR' = clear
	from?: string;
	fromName?: string;
	domain?: string;
	region?: string;
	sesSecret?: string;
	adminNotify?: string;
	disabled?: boolean;
}

/** save config (keys encrypted before storage; last four recorded for UI recognition) */
export async function saveEmailConfig(
	db: D1Database,
	masterKey: string | undefined,
	input: EmailConfigInput
): Promise<{ ok: boolean; error?: string }> {
	if (input.provider && !PROVIDERS.some((p) => p.id === input.provider))
		return { ok: false, error: '不支援的 provider' };
	if (input.from !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.from.trim()))
		return { ok: false, error: '寄件地址格式不正確' };
	const kit = getDb(db);
	const now = new Date();
	const put = async (k: string, v: string) =>
		kit
			.insert(siteSettings)
			.values({ key: k, value: v, updatedAt: now })
			.onConflictDoUpdate({ target: siteSettings.key, set: { value: v, updatedAt: now } });
	const set: [string, string][] = [];
	if (input.provider) set.push([KEY_PROVIDER, input.provider]);
	if (input.from !== undefined) set.push([KEY_FROM, input.from.trim().toLowerCase()]);
	if (input.fromName !== undefined) set.push([KEY_FROM_NAME, input.fromName.trim().slice(0, 80)]);
	if (input.domain !== undefined) set.push([KEY_DOMAIN, input.domain.trim().slice(0, 200)]);
	if (input.region !== undefined)
		set.push([
			KEY_REGION,
			/^[a-z]{2}-[a-z]+-\d$/.test(input.region.trim()) ? input.region.trim() : ''
		]);
	if (input.disabled !== undefined) set.push([KEY_DISABLED, input.disabled ? '1' : '0']);
	if (input.adminNotify !== undefined) {
		const an = input.adminNotify.trim().toLowerCase();
		if (an && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(an))
			return { ok: false, error: '站長通知地址格式不正確' };
		set.push([KEY_ADMIN_NOTIFY, an]);
	}
	for (const [k, v] of set) await put(k, v);

	const key = input.apiKey?.trim();
	if (key && key !== 'CLEAR') {
		if (!masterKey) return { ok: false, error: 'AI_SECRET 主金鑰未配置，無法加密憑證' };
		await put(KEY_API, await encryptSecret(masterKey, key));
		await put('email_key_tail', key.slice(-4));
	} else if (key === 'CLEAR') {
		await put(KEY_API, '');
		await put('email_key_tail', '');
	}
	const ses = input.sesSecret?.trim();
	if (ses && masterKey) {
		const prev = await readKeys(db, [KEY_SECRETS_ENC]);
		const merged: Record<string, string> = {};
		const enc = prev.get(KEY_SECRETS_ENC);
		if (enc?.startsWith('aes256gcm$')) {
			const p = await decryptSecret(masterKey, enc);
			if (p)
				try {
					Object.assign(merged, JSON.parse(p));
				} catch {
					/* corrupted = rebuild */
				}
		}
		merged.sesSecret = ses;
		await put(KEY_SECRETS_ENC, await encryptSecret(masterKey, JSON.stringify(merged)));
	}
	return { ok: true };
}

/* ── send core ───────────────────────────────────────────────────────── */

interface Resolved {
	cfg: EmailConfig;
	apiKey: string;
	sesSecret: string;
}

async function resolve(db: D1Database, masterKey: string | undefined): Promise<Resolved | string> {
	const cfg = await getEmailConfig(db);
	const m = await readKeys(db, [KEY_API, KEY_SECRETS_ENC]);
	if (cfg.disabled) return 'Email 發送已被停用（kill switch）';
	if (cfg.provider === 'cloudflare') {
		if (!envHasEmail()) return '需 Workers Paid 且在 wrangler 配置 EMAIL sending binding';
		return { cfg, apiKey: '', sesSecret: '' };
	}
	const enc = m.get(KEY_API) ?? '';
	if (!enc) return '尚未設定 API 金鑰';
	if (!masterKey) return 'AI_SECRET 主金鑰未配置';
	const apiKey = await decryptSecret(masterKey, enc);
	if (!apiKey) return '憑證解密失敗（主金鑰輪替？）——請重設 API 金鑰';
	let sesSecret = '';
	const se = m.get(KEY_SECRETS_ENC);
	if (se?.startsWith('aes256gcm$')) {
		const p = await decryptSecret(masterKey, se);
		if (p)
			try {
				sesSecret = (JSON.parse(p) as { sesSecret?: string }).sesSecret ?? '';
			} catch {
				/* ignore */
			}
	}
	if (cfg.provider === 'ses' && !sesSecret)
		return 'SES 需 Access Key（api 欄位）與 Secret Key（另欄）';
	return { cfg, apiKey, sesSecret };
}

/** test seam: DB keys can override each provider's base URL (e2e mocks intercept to verify payloads) */
async function baseUrl(db: D1Database, provider: EmailProvider, fallback: string): Promise<string> {
	const m = await readKeys(db, [`email_base_${provider}`]);
	return m.get(`email_base_${provider}`) ?? fallback;
}

/** whether the Cloudflare Email binding exists (env passed by callers; probed globally here) */
type EmailBinding = { send: (msg: Record<string, unknown>) => Promise<void> };
let _emailBinding: EmailBinding | null = null;
export function bindEmailSender(binding: EmailBinding | undefined): void {
	_emailBinding = binding ?? null;
}
function envHasEmail(): boolean {
	return _emailBinding !== null;
}

/** main send entry: route to provider, time it, log it */
export async function sendEmail(
	db: D1Database,
	masterKey: string | undefined,
	input: EmailSendInput
): Promise<EmailResult> {
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.to.trim()))
		return { ok: false, error: '收件地址不合法' };
	const r = await resolve(db, masterKey);
	if (typeof r === 'string') return { ok: false, error: r };
	const { cfg, apiKey, sesSecret } = r;
	const from = cfg.fromName ? `${cfg.fromName} <${cfg.from}>` : cfg.from;
	const t0 = Date.now();
	let res: EmailResult = { ok: false, error: 'provider 未實作' };
	try {
		switch (cfg.provider) {
			case 'resend':
				res = await sendResend(db, cfg, apiKey, from, input);
				break;
			case 'smtp2go':
				res = await sendSmtp2go(db, cfg, apiKey, from, input);
				break;
			case 'postmark':
				res = await sendPostmark(db, cfg, apiKey, from, input);
				break;
			case 'mailgun':
				res = await sendMailgun(db, cfg, apiKey, from, input);
				break;
			case 'ses':
				res = await sendSes(db, cfg, apiKey, sesSecret, input);
				break;
			case 'cloudflare':
				res = await sendCloudflare(cfg, from, input);
				break;
		}
	} catch (e) {
		res = { ok: false, error: `發送異常：${String(e).slice(0, 200)}` };
	}
	await logEmail(db, input, cfg.provider, res, Date.now() - t0);
	return res;
}

async function sendResend(
	db: D1Database,
	cfg: EmailConfig,
	key: string,
	from: string,
	input: EmailSendInput
): Promise<EmailResult> {
	const base = await baseUrl(db, 'resend', 'https://api.resend.com');
	const res = await fetch(`${base}/emails`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			from,
			to: [input.to],
			subject: input.subject,
			html: input.html,
			text: input.text || undefined
		})
	});
	const j = (await res.json().catch(() => ({}))) as {
		id?: string;
		message?: string;
		name?: string;
	};
	if (!res.ok) return { ok: false, error: j.message ?? j.name ?? `HTTP ${res.status}` };
	return { ok: true, id: j.id };
}

async function sendSmtp2go(
	db: D1Database,
	cfg: EmailConfig,
	key: string,
	from: string,
	input: EmailSendInput
): Promise<EmailResult> {
	const base = await baseUrl(db, 'smtp2go', 'https://api.smtp2go.com/v3');
	const res = await fetch(`${base}/email/send`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			api_key: key,
			sender: from,
			to: [input.to],
			subject: input.subject,
			html_body: input.html,
			text_body: input.text || undefined
		})
	});
	const j = (await res.json().catch(() => ({}))) as {
		generate_message_id_response?: { message_ids?: string[]; error?: string; complete?: boolean };
		error?: { error_info?: string };
	};
	if (!res.ok || (j.generate_message_id_response?.error ?? '') !== '')
		return { ok: false, error: j.error?.error_info ?? `HTTP ${res.status}` };
	const ids = j.generate_message_id_response?.message_ids ?? [];
	return ids.length ? { ok: true, id: ids[0] } : { ok: false, error: 'provider 未回傳 message id' };
}

async function sendPostmark(
	db: D1Database,
	cfg: EmailConfig,
	key: string,
	from: string,
	input: EmailSendInput
): Promise<EmailResult> {
	const base = await baseUrl(db, 'postmark', 'https://api.postmarkapp.com');
	const res = await fetch(`${base}/email`, {
		method: 'POST',
		headers: {
			'X-Postmark-Server-Token': key,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			From: from,
			To: input.to,
			Subject: input.subject,
			HtmlBody: input.html,
			TextBody: input.text || undefined
		})
	});
	const j = (await res.json().catch(() => ({}))) as { MessageID?: string; Message?: string };
	if (!res.ok) return { ok: false, error: j.Message ?? `HTTP ${res.status}` };
	return { ok: true, id: j.MessageID };
}

async function sendMailgun(
	db: D1Database,
	cfg: EmailConfig,
	key: string,
	from: string,
	input: EmailSendInput
): Promise<EmailResult> {
	if (!cfg.domain) return { ok: false, error: 'Mailgun 需填 Domain' };
	const base = await baseUrl(db, 'mailgun', 'https://api.mailgun.net');
	const fd = new FormData();
	fd.set('from', from);
	fd.set('to', input.to);
	fd.set('subject', input.subject);
	fd.set('html', input.html);
	if (input.text) fd.set('text', input.text);
	const res = await fetch(`${base}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
		method: 'POST',
		headers: { Authorization: `Basic ${b64(`api:${key}`)}` },
		body: fd
	});
	const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
	if (!res.ok) return { ok: false, error: j.message ?? `HTTP ${res.status}` };
	return { ok: true, id: j.id?.replace(/[<>]/g, '') };
}

async function sendCloudflare(
	cfg: EmailConfig,
	from: string,
	input: EmailSendInput
): Promise<EmailResult> {
	if (!_emailBinding) return { ok: false, error: 'EMAIL binding 不可用（需 Workers Paid）' };
	try {
		await _emailBinding.send({
			to: input.to,
			from: cfg.from,
			subject: input.subject,
			htmlMessage: input.html,
			textMessage: input.text || undefined
		});
		return { ok: true };
	} catch (e) {
		return { ok: false, error: `Cloudflare Email：${String(e).slice(0, 160)}` };
	}
}

/* ── Amazon SES (SigV4, pure WebCrypto) ───────────────────────────────── */

async function sendSes(
	db: D1Database,
	cfg: EmailConfig,
	accessKey: string,
	secretKey: string,
	input: EmailSendInput
): Promise<EmailResult> {
	const region = cfg.region || 'us-east-1';
	const endpoint = await baseUrl(db, 'ses', `https://email.${region}.amazonaws.com`);
	const host = new URL(endpoint).host;
	const payload = JSON.stringify({
		Source: cfg.fromName ? `${cfg.fromName} <${cfg.from}>` : cfg.from,
		Destination: { ToAddresses: [input.to] },
		Message: {
			Subject: { Data: input.subject, Charset: 'UTF-8' },
			Body: {
				Html: { Data: input.html, Charset: 'UTF-8' },
				...(input.text ? { Text: { Data: input.text, Charset: 'UTF-8' } } : {})
			}
		}
	});
	const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
	const dateStamp = amzDate.slice(0, 8);
	const headers = [
		`content-type:application/x-amz-json-1.1`,
		`host:${host}`,
		`x-amz-date:${amzDate}`,
		`x-amz-target:ses-20171214.SendEmail`
	];
	const canonical = `POST\n/\n\n${headers.map((h) => h + '\n').join('')}\n${headers
		.map((h) => h.split(':')[0])
		.join(';')}\n${hex(await sha256Bytes(new TextEncoder().encode(payload)))}`;
	const scope = `${dateStamp}/${region}/ses/aws4_request`;
	const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hex(await sha256Bytes(new TextEncoder().encode(canonical)))}`;
	let k = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
	k = await hmac(k, region);
	k = await hmac(k, 'ses');
	k = await hmac(k, 'aws4_request');
	const signature = hex(await hmac(k, stringToSign));
	const signedHeaders = headers.map((h) => h.split(':')[0]).join(';');
	const res = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-amz-json-1.1',
			'X-Amz-Date': amzDate,
			'X-Amz-Target': 'ses-20171214.SendEmail',
			Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
		},
		body: payload
	});
	const j = (await res.json().catch(() => ({}))) as { MessageId?: string; Message?: string };
	if (!res.ok) return { ok: false, error: j.Message ?? `HTTP ${res.status}` };
	return { ok: true, id: j.MessageId };
}

/* ── Log ────────────────────────────────────────────────────────────── */

export interface EmailLogRow {
	id: number;
	to: string;
	template: string;
	provider: string;
	subject: string;
	status: string;
	error: string | null;
	latencyMs: number | null;
	createdAt: number;
}

async function logEmail(
	db: D1Database,
	input: EmailSendInput,
	provider: string,
	res: EmailResult,
	ms: number
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO email_logs (to_addr, template, provider, subject, status, error, latency_ms, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
		)
		.bind(
			input.to,
			input.template ?? 'custom',
			provider,
			input.subject.slice(0, 300),
			res.ok ? 'sent' : 'failed',
			res.ok ? null : res.error.slice(0, 400),
			ms,
			Date.now()
		)
		.run();
}

export async function listEmailLogs(db: D1Database, limit = 50): Promise<EmailLogRow[]> {
	// observation table not in the drizzle schema — uses d1 raw
	const raw = await db
		.prepare(
			`SELECT id, to_addr, template, provider, subject, status, error, latency_ms, created_at FROM email_logs ORDER BY created_at DESC LIMIT ?`
		)
		.bind(limit)
		.all<EmailLogRow & Record<string, unknown>>();
	return (raw.results ?? []).map((r) => ({
		id: Number(r.id),
		to: String(r.to_addr),
		template: String(r.template),
		provider: String(r.provider),
		subject: String(r.subject),
		status: String(r.status),
		error: r.error ? String(r.error) : null,
		latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
		createdAt: Number(r.created_at)
	}));
}

/* ── connectivity test / test email ───────────────────────────────────────────────── */

/** connectivity test that sends nothing: each provider's validate endpoint (format check where absent) */
export async function testEmailConnection(
	db: D1Database,
	masterKey: string | undefined
): Promise<EmailResult> {
	const r = await resolve(db, masterKey);
	if (typeof r === 'string') return { ok: false, error: r };
	const { cfg, apiKey } = r;
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.from)) return { ok: false, error: '请先設定寄件地址' };
	if (cfg.provider === 'cloudflare')
		return envHasEmail()
			? { ok: true }
			: { ok: false, error: 'EMAIL binding 不可用（需 Workers Paid）' };
	const base = {
		resend: 'https://api.resend.com',
		smtp2go: 'https://api.smtp2go.com/v3',
		postmark: 'https://api.postmarkapp.com',
		mailgun: 'https://api.mailgun.net',
		ses: `https://email.${cfg.region || 'us-east-1'}.amazonaws.com`
	}[cfg.provider];
	const u = await baseUrl(db, cfg.provider, base);
	try {
		if (cfg.provider === 'resend') {
			const res = await fetch(`${u}/api_keys/validate`, {
				headers: { Authorization: `Bearer ${apiKey}` }
			});
			return res.ok
				? { ok: true }
				: {
						ok: false,
						error: `金鑰無效（HTTP ${res.status}；舊版 key 可能不支援 validate，請用測試信驗證）`
					};
		}
		if (cfg.provider === 'postmark') {
			const res = await fetch(`${u}/deliveryStatistics?count=1`, {
				headers: { 'X-Postmark-Server-Token': apiKey, Accept: 'application/json' }
			});
			return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
		}
		if (cfg.provider === 'smtp2go') {
			const res = await fetch(`${u}/lists`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ api_key: apiKey, limit: 1 })
			});
			const j = (await res.json().catch(() => ({}))) as {
				generate_lists_response?: { complete?: boolean };
			};
			return j.generate_lists_response?.complete === true
				? { ok: true }
				: { ok: false, error: '金鑰無效或無清單權限' };
		}
		if (cfg.provider === 'mailgun') {
			const res = await fetch(`${u}/v3/domains`, {
				headers: { Authorization: `Basic ${b64(`api:${apiKey}`)}` }
			});
			return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
		}
		// SES: no cheap validate without sending — report success on format check (the test email is the final word)
		return { ok: true, id: 'format-only' };
	} catch (e) {
		return { ok: false, error: `網路錯誤：${String(e).slice(0, 160)}` };
	}
}

/** send a test email (greeting with site name, template='test') */
export async function sendTestEmail(
	db: D1Database,
	masterKey: string | undefined,
	to: string
): Promise<EmailResult> {
	const settings = await getSettings(db);
	const siteName = settings.name || 'Kikigaki';
	return sendEmail(db, masterKey, {
		to,
		template: 'test',
		subject: `【${siteName}】Email 測試信`,
		html: `<div style="font-family:ui-sans-serif,system-ui;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">📧 測試成功</h2>
<p style="margin:0 0 8px;color:#444">這封由 <b>${esc(siteName)}</b>（Kikigaki CMS）的 Email 系統寄出。</p>
<p style="margin:0;color:#888;font-size:13px">收到這封信代表 provider 設定正確。正式郵件範本於 Phase 67b 提供。</p>
</div>`,
		text: `Email 測試成功：這封由 ${siteName}（Kikigaki CMS）寄出。`
	});
}

/* ── helpers ────────────────────────────────────────────────────────── */

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (s: string) => btoa(s);
const hex = (buf: ArrayBuffer) =>
	[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256Bytes(data: Uint8Array): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
}
async function hmac(key: ArrayBuffer | Uint8Array | string, msg: string): Promise<ArrayBuffer> {
	const kbuf =
		typeof key === 'string'
			? new TextEncoder().encode(key)
			: key instanceof Uint8Array
				? key
				: new Uint8Array(key);
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		kbuf as unknown as ArrayBuffer,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
}
