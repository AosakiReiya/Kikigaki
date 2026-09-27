/**
 * MCP tool registration (Phase 30.3): D1 directory cache → dynamic ToolDefs;
 * headers decrypted at load (carried in closures); execution path mirrors regular server tools.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { getDb } from '$lib/server/db';
import { decryptSecret, encryptSecret } from '$lib/server/secrets';
import { mcpServers, mcpTools } from '$lib/server/db/schema';

/* ---- server CRUD (for the settings page) ---- */

export interface McpServerRow {
	id: string;
	name: string;
	label: string;
	url: string;
	enabled: boolean;
	timeoutMs: number;
	risk: string;
	instructions: string;
	status: string;
	statusNote: string;
	hasHeaders: boolean;
	toolCount: number;
}

const NAME_RE = /^[a-z][a-z0-9_-]{1,30}$/;

export async function listMcpServers(db: D1Database): Promise<McpServerRow[]> {
	const kit = getDb(db);
	const rows = await kit.select().from(mcpServers);
	const counts = rows.length
		? await kit
				.select({ sid: mcpTools.serverId, n: sql<number>`count(*)` })
				.from(mcpTools)
				.where(
					inArray(
						mcpTools.serverId,
						rows.map((r) => r.id)
					)
				)
				.groupBy(mcpTools.serverId)
		: [];
	const byId = new Map(counts.map((c) => [c.sid, Number(c.n)]));
	return rows
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((r) => ({
			id: r.id,
			name: r.name,
			label: r.label,
			url: r.url,
			enabled: r.enabled,
			timeoutMs: r.timeoutMs,
			risk: r.risk,
			instructions: r.instructions,
			status: r.status,
			statusNote: r.statusNote,
			hasHeaders: r.headersEnc !== '',
			toolCount: byId.get(r.id) ?? 0
		}));
}

export async function listMcpToolsOf(db: D1Database, serverIds: string[]) {
	if (serverIds.length === 0) return [];
	const kit = getDb(db);
	return kit.select().from(mcpTools).where(inArray(mcpTools.serverId, serverIds)).all();
}

export async function upsertMcpServer(
	db: D1Database,
	secret: string | undefined,
	input: {
		id?: string;
		name: string;
		label?: string;
		url: string;
		risk?: string;
		timeoutMs?: number;
		instructions?: string;
		headers?: string;
		enabled?: boolean;
	}
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	if (!NAME_RE.test(input.name))
		return { ok: false, error: 'name_invalid（a-z 開頭，2-31 字元 [a-z0-9_-]）' };
	let url: URL;
	try {
		url = new URL(input.url);
	} catch {
		return { ok: false, error: 'url_invalid' };
	}
	if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
		return { ok: false, error: 'url_unsafe（僅 https 或本機）' };
	if (input.headers?.trim()) {
		try {
			const parsed: unknown = JSON.parse(input.headers);
			if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'headers_not_json' };
		} catch {
			return { ok: false, error: 'headers_not_json' };
		}
	}
	const kit = getDb(db);
	const now = new Date();
	const enc =
		input.headers?.trim() && secret ? await encryptSecret(secret, input.headers.trim()) : null;
	if (input.id) {
		const patch: Record<string, unknown> = {
			name: input.name,
			label: input.label?.trim() ?? '',
			url: url.toString(),
			risk: input.risk ?? 'high',
			timeoutMs: Math.min(Math.max(input.timeoutMs ?? 30000, 3000), 120000),
			instructions: (input.instructions ?? '').slice(0, 2000),
			updatedAt: now
		};
		if (input.enabled !== undefined) patch.enabled = input.enabled;
		if (enc) patch.headersEnc = enc;
		await kit.update(mcpServers).set(patch).where(eq(mcpServers.id, input.id));
		return { ok: true, id: input.id };
	}
	const id = crypto.randomUUID();
	try {
		await kit.insert(mcpServers).values({
			id,
			name: input.name,
			label: input.label?.trim() ?? '',
			url: url.toString(),
			headersEnc: enc ?? '',
			risk: input.risk ?? 'high',
			timeoutMs: Math.min(Math.max(input.timeoutMs ?? 30000, 3000), 120000),
			instructions: (input.instructions ?? '').slice(0, 2000),
			enabled: input.enabled ?? true,
			createdAt: now,
			updatedAt: now
		});
	} catch {
		return { ok: false, error: 'name_exists（名稱重複）' };
	}
	return { ok: true, id };
}

export async function deleteMcpServer(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(mcpTools).where(eq(mcpTools.serverId, id));
	await kit.delete(mcpServers).where(eq(mcpServers.id, id));
}
import { eq, inArray, sql } from 'drizzle-orm';
import type { ToolDef, Risk } from '$lib/agent/tools';
import { mcpListTools, mcpCallTool } from './client';

/** tool naming same as OpenCode: sanitize(server) + '_' + sanitize(tool) */
export function sanitizeMcp(s: string): string {
	return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}
export function mcpToolName(serverName: string, toolName: string): string {
	return `${sanitizeMcp(serverName)}_${sanitizeMcp(toolName)}`;
}

/** connect and refresh a server's tool cache + status (settings-page "test connection" and manual refresh) */
export async function refreshServerTools(
	db: D1Database,
	secret: string | undefined,
	serverId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
	const kit = getDb(db);
	const [srv] = await kit.select().from(mcpServers).where(eq(mcpServers.id, serverId)).limit(1);
	if (!srv) return { ok: false, error: 'server_not_found' };
	let headers: Record<string, string> = {};
	if (srv.headersEnc && secret) {
		const dec = await decryptSecret(secret, srv.headersEnc);
		try {
			headers = dec ? (JSON.parse(dec) as Record<string, string>) : {};
		} catch {
			headers = {};
		}
	}
	const now = new Date();
	try {
		const { tools } = await mcpListTools(srv.url, headers, srv.timeoutMs);
		await kit.delete(mcpTools).where(eq(mcpTools.serverId, srv.id));
		for (const tl of tools.slice(0, 64)) {
			await kit.insert(mcpTools).values({
				serverId: srv.id,
				name: mcpToolName(srv.name, tl.name),
				rawName: tl.name,
				description: (tl.description ?? '').slice(0, 2000),
				schemaJson: JSON.stringify(tl.inputSchema ?? { type: 'object' }),
				cachedAt: now
			});
		}
		await kit
			.update(mcpServers)
			.set({ status: 'connected', statusNote: `${tools.length} tools`, updatedAt: now })
			.where(eq(mcpServers.id, srv.id));
		return { ok: true, count: tools.length };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await kit
			.update(mcpServers)
			.set({ status: 'failed', statusNote: msg.slice(0, 200), updatedAt: now })
			.where(eq(mcpServers.id, srv.id));
		return { ok: false, error: msg };
	}
}

/** load cached tools of all enabled servers → dynamic ToolDefs (secrets resolve into headers here) */
export async function loadMcpToolDefs(
	db: D1Database,
	secret: string | undefined
): Promise<ToolDef[]> {
	const kit = getDb(db);
	const servers = await kit.select().from(mcpServers).where(eq(mcpServers.enabled, true));
	if (servers.length === 0) return [];
	const out: ToolDef[] = [];
	for (const srv of servers) {
		let headers: Record<string, string> = {};
		if (srv.headersEnc && secret) {
			const dec = await decryptSecret(secret, srv.headersEnc);
			try {
				headers = dec ? (JSON.parse(dec) as Record<string, string>) : {};
			} catch {
				headers = {};
			}
		}
		const cached = await kit.select().from(mcpTools).where(eq(mcpTools.serverId, srv.id));
		for (const row of cached) {
			let schema: Record<string, unknown> = { type: 'object' };
			try {
				const p: unknown = JSON.parse(row.schemaJson || '{}');
				if (p && typeof p === 'object') schema = p as Record<string, unknown>;
			} catch {
				/* use defaults */
			}
			const meta = {
				url: srv.url,
				headers,
				timeoutMs: srv.timeoutMs,
				rawName: row.rawName
			};
			out.push({
				name: row.name,
				description: `[MCP:${srv.name}] ${row.description}`.slice(0, 900),
				permission: srv.risk === 'read' || srv.risk === 'low' ? 'read' : 'write',
				risk: srv.risk as Risk,
				params: {},
				rawSchema: schema,
				summary: (args) => `${row.rawName} ${JSON.stringify(args).slice(0, 140)}`,
				run: async (_ctx, args) => {
					const r = await mcpCallTool(
						meta.url,
						meta.headers,
						meta.timeoutMs,
						meta.rawName,
						args ?? {}
					);
					return r.ok ? { ok: true, result: r.text.slice(0, 8000) } : { ok: false, error: r.text };
				},
				mcp: true
			});
		}
	}
	return out;
}

/** server instructions (injected into the system prompt; enabled servers with content only) */
export async function mcpInstructions(db: D1Database): Promise<string> {
	const kit = getDb(db);
	const servers = await kit.select().from(mcpServers).where(eq(mcpServers.enabled, true));
	return servers
		.filter((s) => s.instructions.trim())
		.map((s) => `【MCP:${s.name}】${s.instructions.trim().slice(0, 800)}`)
		.join('\n');
}
