/**
 * Minimal MCP client (Phase 30; Pages-flavored isomorph of OpenCode mcp/).
 * Remote only: Streamable HTTP (POST JSON-RPC; responses may be JSON or SSE).
 * No persistent connection — every operation runs initialize → notify → request in full (Pages constraint).
 */

const PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'kikigaki-agent', version: '1.0' };

export interface McpToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface McpCallOutcome {
	ok: boolean;
	text: string;
}

interface JsonRpcMsg {
	jsonrpc: '2.0';
	id?: number | string;
	method?: string;
	params?: Record<string, unknown>;
	result?: Record<string, unknown>;
	error?: { code: number; message: string };
}

/** extract the JSON-RPC message with the given id from a (possibly SSE) response */
async function pickRpc(res: Response, id: number): Promise<JsonRpcMsg | null> {
	const ct = res.headers.get('content-type') ?? '';
	const body = await res.text();
	if (ct.includes('application/json')) {
		try {
			return JSON.parse(body) as JsonRpcMsg;
		} catch {
			return null;
		}
	}
	// SSE: scan events for the response with matching id
	for (const block of body.split('\n\n')) {
		const dm = /^data: (.*)$/m.exec(block);
		if (!dm) continue;
		try {
			const msg = JSON.parse(dm[1]) as JsonRpcMsg;
			if (msg.id === id) return msg;
		} catch {
			/* skip non-JSON lines */
		}
	}
	return null;
}

async function post(
	url: string,
	headers: Record<string, string>,
	msg: JsonRpcMsg,
	timeoutMs: number,
	sessionId?: string | null
): Promise<{ res: Response }> {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
			...(sessionId ? { 'mcp-session-id': sessionId } : {}),
			...headers
		},
		body: JSON.stringify(msg),
		signal: AbortSignal.timeout(Math.max(2000, timeoutMs))
	});
	return { res };
}

/** establish a session (initialize + initialized notification); returns session id (may be null = stateless server) */
async function openSession(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number
): Promise<string | null> {
	const { res } = await post(
		url,
		headers,
		{
			jsonrpc: '2.0',
			id: 0,
			method: 'initialize',
			params: {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: {},
				clientInfo: CLIENT_INFO
			}
		},
		timeoutMs
	);
	if (!res.ok) throw new Error(`mcp_initialize_http_${res.status}`);
	const msg = await pickRpc(res, 0);
	if (msg?.error) throw new Error(`mcp_initialize_${msg.error.message}`);
	const sid = res.headers.get('mcp-session-id');
	// initialized notification (id-less; failure not fatal)
	await post(
		url,
		headers,
		{ jsonrpc: '2.0', method: 'notifications/initialized' },
		timeoutMs,
		sid ?? undefined
	).catch(() => undefined);
	return sid;
}

export async function mcpListTools(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number
): Promise<{ tools: McpToolDef[]; instructions: string }> {
	const sid = await openSession(url, headers, timeoutMs);
	const tools: McpToolDef[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 10; page++) {
		const { res } = await post(
			url,
			headers,
			{
				jsonrpc: '2.0',
				id: 1 + page,
				method: 'tools/list',
				params: cursor ? { cursor } : {}
			},
			timeoutMs,
			sid
		);
		if (!res.ok) throw new Error(`mcp_tools_list_http_${res.status}`);
		const msg = await pickRpc(res, 1 + page);
		if (msg?.error) throw new Error(`mcp_tools_list_${msg.error.message}`);
		const r = (msg?.result ?? {}) as { tools?: McpToolDef[]; nextCursor?: string };
		tools.push(...(r.tools ?? []));
		if (!r.nextCursor) break;
		cursor = r.nextCursor;
	}
	return { tools, instructions: '' };
}

export async function mcpCallTool(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
	name: string,
	args: Record<string, unknown>
): Promise<McpCallOutcome> {
	try {
		const sid = await openSession(url, headers, timeoutMs);
		const { res } = await post(
			url,
			headers,
			{ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name, arguments: args } },
			timeoutMs,
			sid
		);
		if (!res.ok) return { ok: false, text: `mcp_http_${res.status}` };
		const msg = await pickRpc(res, 99);
		if (msg?.error) return { ok: false, text: `mcp_error_${msg.error.message}` };
		const r = (msg?.result ?? {}) as {
			isError?: boolean;
			content?: { type: string; text?: string }[];
		};
		const text = (r.content ?? [])
			.filter((c) => c.type === 'text')
			.map((c) => c.text ?? '')
			.join('\n');
		if (r.isError) return { ok: false, text: text || 'mcp_tool_error' };
		return { ok: true, text: text || JSON.stringify(r) };
	} catch (e) {
		const name2 = e instanceof Error ? e.name : '';
		return {
			ok: false,
			text: name2 === 'TimeoutError' ? 'mcp_timeout' : `mcp_network_${name2 || 'fail'}`
		};
	}
}
