/**
 * Runtime Contract (cc/1) — postMessage protocol between host ↔ sandbox component.
 *
 * Security model (established in PoC, kept in Phase 17):
 * - srcdoc + sandbox="allow-scripts" (no allow-same-origin) → component runs in an opaque origin,
 *   so targetOrigin can only be '*'; the real boundary is: **per-mount channel nonce + strict message validation**.
 * - both directions must pass parseEnvelope; any field mismatch = silent drop (no reply, no error — avoids probing feedback).
 * - host only answers ids it issued; sandbox may only request GRANTABLE capabilities (default-deny, see capabilities.ts).
 */

export const CC_PROTOCOL = 'cc/1';

/** sandbox → host */
export const SANDBOX_TO_HOST = ['ready', 'capability-request', 'resize', 'error', 'log'] as const;
/** host → sandbox */
export const HOST_TO_SANDBOX = ['init', 'theme', 'capability-result', 'dispose'] as const;

export type SandboxToHostType = (typeof SANDBOX_TO_HOST)[number];
export type HostToSandboxType = (typeof HOST_TO_SANDBOX)[number];

export interface CCEnvelope<T extends string = string> {
	v: typeof CC_PROTOCOL;
	ch: string;
	seq: number;
	type: T;
	/** capability-request / capability-result pairing id (issued by host for sandbox requests) */
	id?: number;
	payload?: unknown;
}

/** host listener side: accepts only valid sandbox→host messages, returns null otherwise (silent drop) */
export function parseInbound(data: unknown, channel: string): CCEnvelope<SandboxToHostType> | null {
	return parseWith(data, channel, SANDBOX_TO_HOST) as CCEnvelope<SandboxToHostType> | null;
}

/** sandbox side (bridge.js hand-implements the same rules; this is for tests and docs) */
export function parseOutbound(
	data: unknown,
	channel: string
): CCEnvelope<HostToSandboxType> | null {
	return parseWith(data, channel, HOST_TO_SANDBOX) as CCEnvelope<HostToSandboxType> | null;
}

function parseWith(data: unknown, channel: string, allowed: readonly string[]): CCEnvelope | null {
	if (typeof data !== 'object' || data === null) return null;
	const m = data as Record<string, unknown>;
	if (m.v !== CC_PROTOCOL) return null;
	if (typeof m.ch !== 'string' || m.ch !== channel) return null;
	if (typeof m.seq !== 'number' || !Number.isFinite(m.seq) || m.seq < 0) return null;
	if (typeof m.type !== 'string' || !allowed.includes(m.type)) return null;
	if (m.id !== undefined && (typeof m.id !== 'number' || !Number.isInteger(m.id) || m.id < 0)) {
		return null;
	}
	if (m.payload !== undefined && !isJsonSafe(m.payload)) return null;
	return {
		v: CC_PROTOCOL,
		ch: channel,
		seq: m.seq,
		type: m.type as never,
		...(m.id !== undefined ? { id: m.id } : {}),
		...(m.payload !== undefined ? { payload: m.payload } : {})
	};
}

/** payload must be serializable pure data (blocks functions/DOM/circular refs — no object smuggling via the protocol) */
export function isJsonSafe(value: unknown): boolean {
	try {
		JSON.stringify(value);
		return true;
	} catch {
		return false;
	}
}

/** random channel generated at mount (crypto-available environments) */
export function createChannel(): string {
	return `c-${crypto.randomUUID()}`;
}
