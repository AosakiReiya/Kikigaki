/**
 * Search Console service (Phase 65b)
 * - auth: Service Account (JWT RS256 via WebCrypto, zero deps)
 * - credentials: key JSON stored AES-GCM encrypted in site_settings (key=gsc_sa_enc, master = env AI_SECRET)
 * - quota-friendly: inspect/analytics results always pass gsc_cache (TTL: inspect 6h, analytics 12h)
 * - test seams: gsc_token_url / gsc_api_base can point at mocks (DB-level only, not exposed in UI)
 */
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '$lib/server/db';
import { siteSettings, gscCache } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '$lib/server/secrets';

const KEY_SA = 'gsc_sa_enc';
const KEY_PROPERTY = 'gsc_property';
const KEY_TOKEN_URL = 'gsc_token_url';
const KEY_API_BASE = 'gsc_api_base';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_API = 'https://searchconsole.googleapis.com';

export interface GscSaJson {
	client_email: string;
	private_key: string;
}

export type GscResult<T> = { ok: true; data: T } | { ok: false; error: string };

const b64url = (bytes: ArrayBuffer | Uint8Array | string): string => {
	const arr =
		typeof bytes === 'string'
			? new TextEncoder().encode(bytes)
			: bytes instanceof Uint8Array
				? bytes
				: new Uint8Array(bytes);
	let s = '';
	for (const b of arr) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** key JSON (PEM) → RS256 JWT assertion (Google oauth2 jwt-bearer flow) */
export async function signedJwt(sa: GscSaJson, tokenUrl: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const claims = {
		iss: sa.client_email,
		scope: SCOPE,
		aud: tokenUrl,
		iat: now,
		exp: now + 3600
	};
	const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}`;
	const pemBody = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
	const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
	const key = await crypto.subtle.importKey(
		'pkcs8',
		der as unknown as ArrayBuffer,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(signingInput)
	);
	return `${signingInput}.${b64url(sig)}`;
}

async function readKey(db: D1Database, key: string): Promise<string | null> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ value: siteSettings.value })
		.from(siteSettings)
		.where(eq(siteSettings.key, key));
	return row?.value ?? null;
}

export interface GscStatus {
	configured: boolean;
	property: string;
	clientEmail: string;
}

export async function getGscStatus(db: D1Database): Promise<GscStatus> {
	const enc = await readKey(db, KEY_SA);
	// client_email stored as a plaintext companion key (for display); the private key is never decrypted back out
	const email = enc ? ((await readKey(db, 'gsc_sa_email')) ?? '') : '';
	return {
		configured: !!enc,
		property: (await readKey(db, KEY_PROPERTY)) ?? '',
		clientEmail: email
	};
}

export async function saveGscConfig(
	db: D1Database,
	secret: string | undefined,
	cfg: { property?: string; saJson?: string; clear?: boolean }
): Promise<GscResult<true>> {
	if (cfg.clear) {
		const kit = getDb(db);
		await kit.delete(siteSettings).where(eq(siteSettings.key, KEY_SA));
		await kit.delete(siteSettings).where(eq(siteSettings.key, 'gsc_sa_email'));
		return { ok: true, data: true };
	}
	if (cfg.property !== undefined) {
		const v = cfg.property.trim().replace(/\/+$/, '');
		if (v && !/^https?:\/\//.test(v))
			return { ok: false, error: 'property 必須是 http(s) 網址或網域' };
		const kit = getDb(db);
		const now = new Date();
		await kit
			.insert(siteSettings)
			.values({ key: KEY_PROPERTY, value: v, updatedAt: now })
			.onConflictDoUpdate({ target: siteSettings.key, set: { value: v, updatedAt: now } });
	}
	if (cfg.saJson !== undefined && cfg.saJson.trim() !== '') {
		if (!secret) return { ok: false, error: 'encryption_secret_missing（env AI_SECRET 未配置）' };
		let parsed: unknown;
		try {
			parsed = JSON.parse(cfg.saJson);
		} catch {
			return { ok: false, error: 'JSON 無法解析' };
		}
		const sa = parsed as Partial<GscSaJson>;
		if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string')
			return {
				ok: false,
				error: '缺少 client_email 或 private_key（請貼完整的服務帳戶金鑰 JSON）'
			};
		if (!sa.private_key.includes('BEGIN')) return { ok: false, error: 'private_key 格式不對' };
		const enc = await encryptSecret(
			secret,
			JSON.stringify({ client_email: sa.client_email, private_key: sa.private_key })
		);
		const kit = getDb(db);
		const now = new Date();
		for (const [k, v] of [
			[KEY_SA, enc],
			['gsc_sa_email', sa.client_email]
		] as const) {
			await kit
				.insert(siteSettings)
				.values({ key: k, value: v, updatedAt: now })
				.onConflictDoUpdate({ target: siteSettings.key, set: { value: v, updatedAt: now } });
		}
	}
	return { ok: true, data: true };
}

async function loadSa(db: D1Database, secret: string | undefined): Promise<GscSaJson | null> {
	const enc = await readKey(db, KEY_SA);
	if (!enc || !secret) return null;
	const plain = enc.startsWith('aes256gcm$') ? await decryptSecret(secret, enc) : null;
	if (!plain) return null;
	try {
		return JSON.parse(plain) as GscSaJson;
	} catch {
		return null;
	}
}

async function accessToken(db: D1Database, secret: string | undefined): Promise<GscResult<string>> {
	const sa = await loadSa(db, secret);
	if (!sa) return { ok: false, error: '尚未配置服務帳戶金鑰（或 AI_SECRET 變更導致無法解密）' };
	const tokenUrl = (await readKey(db, KEY_TOKEN_URL)) ?? DEFAULT_TOKEN_URL;
	const jwt = await signedJwt(sa, tokenUrl);
	const res = await fetch(tokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: jwt
		}).toString(),
		signal: AbortSignal.timeout(15_000)
	});
	const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
	if (!res.ok || !j.access_token) return { ok: false, error: `token_${j.error ?? res.status}` };
	return { ok: true, data: j.access_token };
}

async function api(
	db: D1Database,
	secret: string | undefined,
	path: string,
	init?: RequestInit
): Promise<GscResult<unknown>> {
	const t = await accessToken(db, secret);
	if (!t.ok) return t;
	const base = (await readKey(db, KEY_API_BASE)) ?? DEFAULT_API;
	const res = await fetch(`${base}${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${t.data}`,
			'content-type': 'application/json',
			...(init?.headers ?? {})
		},
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		return { ok: false, error: `gsc_${res.status}_${text.slice(0, 120)}` };
	}
	return { ok: true, data: await res.json() };
}

/** connectivity test: listing resources succeeds = key and property permissions both OK */
export async function testGsc(
	db: D1Database,
	secret: string | undefined
): Promise<GscResult<{ sites: number; matched: boolean }>> {
	const r = await api(db, secret, '/v1/sites');
	if (!r.ok) return r;
	const siteList = (r.data as { sites?: { siteUrl: string }[] }).sites ?? [];
	const property = (await readKey(db, KEY_PROPERTY)) ?? '';
	const norm = (u: string) => u.replace(/\/+$/, '');
	return {
		ok: true,
		data: {
			sites: siteList.length,
			matched: siteList.some((s) => norm(s.siteUrl) === norm(property))
		}
	};
}

/* ---------------------------- cache helpers ---------------------------- */

async function cacheGet(db: D1Database, key: string, ttlMs: number): Promise<string | null> {
	const kit = getDb(db);
	const [row] = await kit.select().from(gscCache).where(eq(gscCache.key, key));
	if (!row) return null;
	if (Date.now() - row.fetchedAt.getTime() > ttlMs) return null;
	return row.value;
}

async function cachePut(db: D1Database, key: string, value: string): Promise<void> {
	const kit = getDb(db);
	await kit
		.insert(gscCache)
		.values({ key, value, fetchedAt: new Date() })
		.onConflictDoUpdate({ target: gscCache.key, set: { value, fetchedAt: new Date() } });
}

export interface InspectView {
	url: string;
	indexingState: string;
	coverage: string;
	lastCrawl: string;
	canonical: string;
	verbatimRobots: boolean;
	cachedAt: number;
}

/** URL inspection (live: crawl/index/canonical choice); 6h cache */
export async function inspectUrl(
	db: D1Database,
	secret: string | undefined,
	url: string
): Promise<GscResult<InspectView>> {
	const property = (await readKey(db, KEY_PROPERTY)) ?? '';
	if (!property) return { ok: false, error: '尚未設定 property' };
	const ck = `inspect:${property}|${url}`;
	const hit = await cacheGet(db, ck, 6 * 3600_000);
	if (hit) return { ok: true, data: JSON.parse(hit) as InspectView };
	const r = await api(db, secret, '/v1/urlInspection/index:inspect', {
		method: 'POST',
		body: JSON.stringify({ inspectionUrl: url, siteUrl: property, languageCode: 'zh-TW' })
	});
	if (!r.ok) return r;
	const idx =
		(r.data as { inspectionResult?: { indexStatusResult?: Record<string, unknown> } })
			.inspectionResult?.indexStatusResult ?? {};
	const v: InspectView = {
		url,
		indexingState: String(idx.indexingState ?? 'UNKNOWN'),
		coverage: String(idx.coverageState ?? 'UNKNOWN'),
		lastCrawl: String(idx.lastCrawlTime ?? ''),
		canonical: String(idx.googleCanonical ?? ''),
		verbatimRobots: Boolean(idx.isVerbatimRobotsFile ?? false),
		cachedAt: Date.now()
	};
	await cachePut(db, ck, JSON.stringify(v));
	return { ok: true, data: v };
}

export interface AnalyticsView {
	rows: { query: string; clicks: number; impressions: number; position: number }[];
	rowsPages: { page: string; clicks: number; impressions: number; position: number }[];
	from: string;
	to: string;
	cachedAt: number;
}

/** search performance (QUERY + PAGE dimensions in one pull); 12h cache */
export async function siteAnalytics(
	db: D1Database,
	secret: string | undefined,
	days = 28
): Promise<GscResult<AnalyticsView>> {
	const property = (await readKey(db, KEY_PROPERTY)) ?? '';
	if (!property) return { ok: false, error: '尚未設定 property' };
	const ck = `an:${property}:${days}`;
	const hit = await cacheGet(db, ck, 12 * 3600_000);
	if (hit) return { ok: true, data: JSON.parse(hit) as AnalyticsView };
	const to = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10); // data lags ~2 days
	const from = new Date(Date.now() - (days + 2) * 86400_000).toISOString().slice(0, 10);
	const q = async (dims: string[]) => {
		const r = await api(db, secret, `/v1/searchAnalytics/${encodeURIComponent(property)}/query`, {
			method: 'POST',
			body: JSON.stringify({ startDate: from, endDate: to, dimensions: dims, rowLimit: 20 })
		});
		if (!r.ok) throw new Error(r.error);
		return (r.data as { rows?: Record<string, unknown>[] }).rows ?? [];
	};
	let rowsQ: Record<string, unknown>[];
	let rowsP: Record<string, unknown>[];
	try {
		[rowsQ, rowsP] = [await q(['query']), await q(['page'])];
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'query_failed' };
	}
	const v: AnalyticsView = {
		rows: rowsQ.map((x) => ({
			query: String((x.keys as string[] | undefined)?.[0] ?? x.query ?? ''),
			clicks: Number(x.clicks ?? 0),
			impressions: Number(x.impressions ?? 0),
			position: Math.round(Number(x.position ?? 0) * 10) / 10
		})),
		rowsPages: rowsP
			.map((x) => ({
				page: decodeURIComponent(String(x.page ?? '')),
				clicks: Number(x.clicks ?? 0),
				impressions: Number(x.impressions ?? 0),
				position: Math.round(Number(x.position ?? 0) * 10) / 10
			}))
			.slice(0, 20),
		from,
		to,
		cachedAt: Date.now()
	};
	await cachePut(db, ck, JSON.stringify(v));
	return { ok: true, data: v };
}
