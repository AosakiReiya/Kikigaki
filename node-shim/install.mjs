/**
 * Phase 77a — self-host platform 安裝器（server.mjs 最先執行）。
 * 掛 globalThis.__PLATFORM_SHIM__；hooks.server 於 event.platform 缺席時注入——
 * 全站 platform.env 消費點零改動。Cloudflare build 不含本檔（無靜態 import）。
 */
import { D1SqliteShim } from './d1.mjs';
import { R2FsShim } from './r2.mjs';

export function installPlatformShim() {
	process.env.SELF_HOST ??= '1';
	const dbPath = process.env.SELF_HOST_DB ?? './data/kikigaki.sqlite';
	const bucketRoot = process.env.SELF_HOST_MEDIA ?? './data/media';
	globalThis.__PLATFORM_SHIM__ = {
		env: {
			DB: new D1SqliteShim(dbPath),
			BUCKET: new R2FsShim(bucketRoot),
			AI_SECRET: process.env.AI_SECRET ?? '',
			CRON_SECRET: process.env.CRON_SECRET ?? '',
			TURNSTILE_SECRET: process.env.TURNSTILE_SECRET ?? '',
			TURNSTILE_HOSTNAMES: process.env.TURNSTILE_HOSTNAMES ?? ''
		}
	};
	console.log(`[self-host] platform shim ready (db=${dbPath}, media=${bucketRoot})`);
}
