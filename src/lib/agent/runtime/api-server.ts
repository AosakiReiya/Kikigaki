/**
 * Agent API shared server helpers: EventChannel (persist + SSE forward), ownership checks.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { appendEvent } from './store';
import { countActiveRunsForUser, getRun, getSession, type SessionRow } from './store';
import type { SseHandle } from './sse';
import type { EventChannel } from './engine';
import type { AgentEventPayloads, AgentEventType } from './types';

/** build a channel where "structured events = persist then forward; deltas = forward only" */
export function makeChannel(db: D1Database, sessionId: string, h: SseHandle): EventChannel {
	return {
		delta: (text) => {
			h.send('message.delta', { text });
		},
		reasoning: (text) => {
			h.send('reasoning.delta', { text });
		},
		emit: async <T extends AgentEventType>(
			type: T,
			payload: AgentEventPayloads[T],
			runId?: string | null
		) => {
			const id = await appendEvent(db, {
				sessionId,
				runId: runId ?? null,
				type,
				payload: payload as Record<string, unknown>
			});
			h.send(type, { id, payload }, id);
		},
		emitRaw: async (type, payload, runId) => {
			const id = await appendEvent(db, {
				sessionId,
				runId: runId ?? null,
				type,
				payload
			});
			h.send(type, { id, payload }, id);
		}
	};
}

/** fetch a session and verify ownership (null = missing or not yours) */
export async function ownedSession(
	db: D1Database,
	sessionId: string,
	userId: string
): Promise<SessionRow | null> {
	const s = await getSession(db, sessionId);
	return s && s.userId === userId ? s : null;
}

/** fetch a run and verify ownership via its session */
export async function ownedRun(db: D1Database, runId: string, userId: string) {
	const run = await getRun(db, runId);
	if (!run) return null;
	const session = await getSession(db, run.sessionId);
	if (!session || session.userId !== userId) return null;
	return { run, session };
}

/** per-user cap on non-terminal runs (risk control: multi-window / malicious pumping) */
export const MAX_ACTIVE_RUNS_PER_USER = 4;

export async function userQuotedOk(db: D1Database, userId: string): Promise<boolean> {
	const n = await countActiveRunsForUser(db, userId);
	return n < MAX_ACTIVE_RUNS_PER_USER;
}
