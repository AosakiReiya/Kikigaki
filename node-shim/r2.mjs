/**
 * Phase 77a — R2Bucket shim over 本地檔案系統（self-host；volume 掛載）。
 * 站內消費面：get/put/delete/list。
 */
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export class R2FsShim {
	constructor(root) {
		this.root = path.resolve(root);
	}
	#p(key) {
		const full = path.resolve(this.root, String(key).replace(/^\/+/, ''));
		if (!full.startsWith(this.root)) throw new Error(`bad key: ${key}`);
		return full;
	}
	async get(key) {
		try {
			const full = this.#p(key);
			const st = await stat(full);
			const buf = await readFile(full);
			return {
				key,
				size: st.size,
				uploaded: st.mtime,
				body: Readable.toWeb(createReadStream(full)),
				arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
				text: async () => buf.toString('utf8'),
				bodyUsed: false
			};
		} catch {
			return null;
		}
	}
	async put(key, value) {
		const full = this.#p(key);
		await mkdir(path.dirname(full), { recursive: true });
		let data;
		if (typeof value === 'string') data = new TextEncoder().encode(value);
		else if (value instanceof Uint8Array) data = value;
		else if (value instanceof ArrayBuffer) data = new Uint8Array(value);
		else if (typeof value?.getReader === 'function')
			data = new Uint8Array(await new Response(value).arrayBuffer());
		else data = new Uint8Array(await value.arrayBuffer());
		await writeFile(full, data);
		return { key };
	}
	async delete(keys) {
		for (const k of Array.isArray(keys) ? keys : [keys]) await rm(this.#p(k), { force: true });
	}
	async list(opts = {}) {
		const prefix = opts.prefix ?? '';
		const limit = Math.min(opts.limit ?? 1000, 1000);
		const objects = [];
		const walk = async (dir) => {
			let entries;
			try {
				entries = await readdir(dir);
			} catch {
				return;
			}
			for (const e of entries) {
				const full = path.join(dir, e);
				const st = await stat(full);
				if (st.isDirectory()) await walk(full);
				else {
					const key = path.relative(this.root, full).split(path.sep).join('/');
					if (key.startsWith(prefix)) objects.push({ key, size: st.size, uploaded: st.mtime });
				}
			}
		};
		await walk(this.root);
		objects.sort((a, b) => a.key.localeCompare(b.key));
		const start = opts.cursor ? objects.findIndex((o) => o.key > opts.cursor) + 1 : 0;
		const page = objects.slice(Math.max(0, start), Math.max(0, start) + limit);
		return { objects: page, truncated: start + limit < objects.length, cursor: page.at(-1)?.key };
	}
}
