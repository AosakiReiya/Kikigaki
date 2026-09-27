/**
 * Agent Runtime data layer (D1/Drizzle) — isolated access to eight tables.
 * All reads/writes go through this layer; the engine writes no SQL (consistent with the "no raw SQL" principle).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import {
	agentApprovals,
	agentEvents,
	agentMessages,
	agentPlanSteps,
	agentPlans,
	agentRuns,
	agentSessions,
	agentToolCalls
} from '$lib/server/db/schema';
import type { AgentMsg } from '$lib/server/ai';
import type { AgentMode, PersistedEvent, PlanStepStatus, Risk } from './types';
import type { RunLimits } from './policy';

const epoch = (d: Date | number | null | undefined): number =>
	d instanceof Date ? d.getTime() : (d ?? 0);

/* ---- sessions ---- */

export interface SessionRow {
	id: string;
	userId: string;
	title: string;
	mode: AgentMode;
	modelRowId: string | null;
	project: string | null;
	/** chosen agent (null = built-in per mode) */
	agent: string | null;
	createdAt: number;
	updatedAt: number;
}

export async function createSession(
	db: D1Database,
	userId: string,
	mode: AgentMode,
	modelRowId?: string | null,
	project?: string | null,
	agent?: string | null
): Promise<SessionRow> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentSessions)
		.values({
			userId,
			mode,
			modelRowId: modelRowId ?? null,
			project: project ?? null,
			agent: agent ?? null
		})
		.returning();
	return toSession(row);
}

/** project: string = list that project only; null = global only; 'all'/undefined = everything */
export async function listSessions(
	db: D1Database,
	userId: string,
	project?: string | null
): Promise<SessionRow[]> {
	const kit = getDb(db);
	let q = kit.select().from(agentSessions).where(eq(agentSessions.userId, userId));
	if (project != null && project !== 'all') {
		q = kit
			.select()
			.from(agentSessions)
			.where(and(eq(agentSessions.userId, userId), eq(agentSessions.project, project)));
	}
	const rows = await q.orderBy(desc(agentSessions.updatedAt)).limit(50);
	return rows.map(toSession);
}

export async function getSession(db: D1Database, id: string): Promise<SessionRow | null> {
	const kit = getDb(db);
	const [row] = await kit.select().from(agentSessions).where(eq(agentSessions.id, id)).limit(1);
	return row ? toSession(row) : null;
}

export async function renameSession(db: D1Database, id: string, title: string): Promise<void> {
	const kit = getDb(db);
	await kit
		.update(agentSessions)
		.set({ title, updatedAt: new Date() })
		.where(eq(agentSessions.id, id));
}

/** update session mode/model (for the Floating Agent selector) */
export async function setSessionAttrs(
	db: D1Database,
	id: string,
	attrs: { mode?: AgentMode; modelRowId?: string | null; agent?: string | null }
): Promise<void> {
	const kit = getDb(db);
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (attrs.mode) patch.mode = attrs.mode;
	if (attrs.modelRowId !== undefined) patch.modelRowId = attrs.modelRowId;
	if (attrs.agent !== undefined) patch.agent = attrs.agent;
	await kit.update(agentSessions).set(patch).where(eq(agentSessions.id, id));
}

export async function touchSession(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.update(agentSessions).set({ updatedAt: new Date() }).where(eq(agentSessions.id, id));
}

export async function deleteSession(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(agentSessions).where(eq(agentSessions.id, id));
}

function toSession(r: typeof agentSessions.$inferSelect): SessionRow {
	return {
		id: r.id,
		userId: r.userId,
		title: r.title,
		mode: r.mode as AgentMode,
		modelRowId: r.modelRowId,
		project: r.project ?? null,
		agent: r.agent ?? null,
		createdAt: epoch(r.createdAt),
		updatedAt: epoch(r.updatedAt)
	};
}

/* ---- runs ---- */

export interface RunRow {
	id: string;
	sessionId: string;
	status: string;
	input: string;
	context: string;
	step: number;
	stepsUsed: number;
	toolCallsUsed: number;
	consecutiveFailures: number;
	inputTokens: number;
	outputTokens: number;
	maxSteps: number;
	maxToolCalls: number;
	maxTokenBudget: number;
	wallMs: number;
	cancelRequested: boolean;
	error: string | null;
	createdAt: number;
	updatedAt: number;
	finishedAt: number | null;
}

/** runs created by this user within the recent window (Phase 28 W5: /api/agent run-creation rate limit) */
export async function recentRunCount(
	db: D1Database,
	userId: string,
	windowMs: number
): Promise<number> {
	const kit = getDb(db);
	const since = new Date(Date.now() - windowMs);
	const rows = await kit
		.select({ n: sql<number>`count(*)` })
		.from(agentRuns)
		.innerJoin(agentSessions, eq(agentRuns.sessionId, agentSessions.id))
		.where(and(eq(agentSessions.userId, userId), gt(agentRuns.createdAt, since)));
	return Number(rows[0]?.n ?? 0);
}

/** event retention cleanup: delete agent_events older than keepDays (only terminal runs; 90-day audit) */
export async function purgeOldEvents(db: D1Database, keepDays = 90): Promise<number> {
	const kit = getDb(db);
	const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
	const rows = await kit
		.delete(agentEvents)
		.where(lte(agentEvents.createdAt, cutoff))
		.returning({ id: agentEvents.id });
	return rows.length;
}

export async function createRun(
	db: D1Database,
	opts: { sessionId: string; input: string; context: string; limits: RunLimits }
): Promise<RunRow> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentRuns)
		.values({
			sessionId: opts.sessionId,
			input: opts.input,
			context: opts.context,
			status: 'running',
			maxSteps: opts.limits.maxSteps,
			maxToolCalls: opts.limits.maxToolCalls,
			maxTokenBudget: opts.limits.maxTokenBudget
		})
		.returning();
	return toRun(row);
}

export async function getRun(db: D1Database, id: string): Promise<RunRow | null> {
	const kit = getDb(db);
	const [row] = await kit.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
	return row ? toRun(row) : null;
}

export async function listRuns(db: D1Database, sessionId: string): Promise<RunRow[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentRuns)
		.where(eq(agentRuns.sessionId, sessionId))
		.orderBy(asc(agentRuns.createdAt));
	return rows.map(toRun);
}

export async function activeRunOfSession(
	db: D1Database,
	sessionId: string
): Promise<RunRow | null> {
	const runs = await listRuns(db, sessionId);
	return (
		runs.find(
			(r) => r.status !== 'completed' && r.status !== 'failed' && r.status !== 'cancelled'
		) ?? null
	);
}

export async function updateRun(
	db: D1Database,
	id: string,
	set: Partial<{
		status: string;
		step: number;
		stepsUsed: number;
		toolCallsUsed: number;
		consecutiveFailures: number;
		inputTokens: number;
		outputTokens: number;
		wallMs: number;
		cancelRequested: boolean;
		error: string | null;
		finishedAt: Date;
		maxSteps: number;
	}>
): Promise<void> {
	const kit = getDb(db);
	await kit
		.update(agentRuns)
		.set({ ...set, updatedAt: new Date() })
		.where(eq(agentRuns.id, id));
}

/** usage guard: count of the user's non-terminal runs (queued/running/waiting_*) */
export async function countActiveRunsForUser(db: D1Database, userId: string): Promise<number> {
	const kit = getDb(db);
	const live = await kit
		.select({ id: agentRuns.id })
		.from(agentRuns)
		.innerJoin(agentSessions, eq(agentRuns.sessionId, agentSessions.id))
		.where(
			and(
				eq(agentSessions.userId, userId),
				inArray(agentRuns.status, ['queued', 'running', 'waiting_approval', 'waiting_client'])
			)
		)
		.limit(20);
	return live.length;
}

export async function requestCancelRun(db: D1Database, id: string): Promise<void> {
	await updateRun(db, id, { cancelRequested: true });
}

function toRun(r: typeof agentRuns.$inferSelect): RunRow {
	return {
		id: r.id,
		sessionId: r.sessionId,
		status: r.status,
		input: r.input,
		context: r.context,
		step: r.step,
		stepsUsed: r.stepsUsed,
		toolCallsUsed: r.toolCallsUsed,
		consecutiveFailures: r.consecutiveFailures,
		inputTokens: r.inputTokens,
		outputTokens: r.outputTokens,
		maxSteps: r.maxSteps,
		maxToolCalls: r.maxToolCalls,
		maxTokenBudget: r.maxTokenBudget,
		wallMs: r.wallMs,
		cancelRequested: r.cancelRequested,
		error: r.error,
		createdAt: epoch(r.createdAt),
		updatedAt: epoch(r.updatedAt),
		finishedAt: r.finishedAt ? epoch(r.finishedAt) : null
	};
}

/* ---- messages & history ---- */

export async function appendMessage(
	db: D1Database,
	msg: {
		sessionId: string;
		runId?: string | null;
		role: 'user' | 'assistant' | 'tool';
		content: string;
		toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
		toolCallId?: string;
		reasoning?: string | null;
	}
): Promise<number> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentMessages)
		.values({
			sessionId: msg.sessionId,
			runId: msg.runId ?? null,
			role: msg.role,
			content: msg.content,
			toolCalls: JSON.stringify(msg.toolCalls ?? []),
			toolCallId: msg.toolCallId ?? null,
			reasoning: msg.reasoning ?? null
		})
		.returning({ id: agentMessages.id });
	return row.id;
}

/** rebuild provider conversation history (excl. system; toolCalls JSON restored) */
/** message rows → provider history (pure function; excl. system, toolCalls JSON restored) */
export function toAgentMsgs(
	rows: {
		role: string;
		content: string;
		toolCalls: string;
		toolCallId: string | null;
		reasoning?: string | null;
	}[]
): AgentMsg[] {
	const out: AgentMsg[] = [];
	for (const r of rows) {
		if (r.role === 'system') continue;
		let calls: AgentMsg['toolCalls'] = [];
		try {
			const parsed: unknown = JSON.parse(r.toolCalls || '[]');
			if (Array.isArray(parsed)) calls = parsed as AgentMsg['toolCalls'];
		} catch {
			calls = [];
		}
		out.push({
			role: r.role as AgentMsg['role'],
			content: r.content,
			...(calls && calls.length ? { toolCalls: calls } : {}),
			...(r.toolCallId ? { toolCallId: r.toolCallId } : {}),
			...(r.reasoning ? { reasoning: r.reasoning } : {})
		});
	}
	return out;
}

/**
 * Rebuild provider history: keep the **latest** HISTORY_LIMIT rows (W0 fix:
 * the old asc+limit kept the oldest and dropped the newest = patchy long-session memory).
 */
export const HISTORY_LIMIT = 400;
export async function buildHistory(db: D1Database, sessionId: string): Promise<AgentMsg[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentMessages)
		.where(eq(agentMessages.sessionId, sessionId))
		.orderBy(desc(agentMessages.id))
		.limit(HISTORY_LIMIT);
	return toAgentMsgs(rows.reverse());
}

/** for compact: all message rows (id ascending) */
export async function getAllMessageRows(
	db: D1Database,
	sessionId: string
): Promise<{ id: number; role: string; content: string; hasCalls: boolean }[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			id: agentMessages.id,
			role: agentMessages.role,
			content: agentMessages.content,
			toolCalls: agentMessages.toolCalls
		})
		.from(agentMessages)
		.where(eq(agentMessages.sessionId, sessionId))
		.orderBy(asc(agentMessages.id));
	return rows.map((r) => ({
		id: r.id,
		role: r.role,
		content: r.content,
		hasCalls: r.toolCalls.length > 4 && r.toolCalls !== '[]'
	}));
}

/** in-place compaction: firstId row becomes the summary (role→user, toolCalls cleared); rows before (firstId, cutExclusive) deleted */
export async function applyCompactRewrite(
	db: D1Database,
	sessionId: string,
	firstOldId: number,
	cutExclusiveId: number,
	summary: string
): Promise<void> {
	const kit = getDb(db);
	await kit
		.update(agentMessages)
		.set({ role: 'user', content: summary, toolCalls: '[]', toolCallId: null })
		.where(eq(agentMessages.id, firstOldId));
	await kit
		.delete(agentMessages)
		.where(
			and(
				eq(agentMessages.sessionId, sessionId),
				gt(agentMessages.id, firstOldId),
				sql`${agentMessages.id} < ${cutExclusiveId}`
			)
		);
}

/* ---- events ---- */

export async function appendEvent(
	db: D1Database,
	ev: { sessionId: string; runId?: string | null; type: string; payload?: Record<string, unknown> }
): Promise<number> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentEvents)
		.values({
			sessionId: ev.sessionId,
			runId: ev.runId ?? null,
			type: ev.type,
			payload: JSON.stringify(ev.payload ?? {})
		})
		.returning({ id: agentEvents.id });
	return row.id;
}

export async function eventsAfter(
	db: D1Database,
	sessionId: string,
	cursor: number
): Promise<PersistedEvent[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentEvents)
		.where(and(eq(agentEvents.sessionId, sessionId), gt(agentEvents.id, cursor)))
		.orderBy(asc(agentEvents.id))
		.limit(300);
	return rows.map((r) => {
		let payload: Record<string, unknown> = {};
		try {
			const parsed: unknown = JSON.parse(r.payload);
			if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
		} catch {
			payload = {};
		}
		return {
			id: r.id,
			sessionId: r.sessionId,
			runId: r.runId,
			type: r.type as PersistedEvent['type'],
			payload,
			createdAt: epoch(r.createdAt)
		};
	});
}

/* ---- plans ---- */

export interface PlanStepRow {
	id: string;
	ordinal: number;
	label: string;
	status: PlanStepStatus;
	note: string;
}

export interface PlanRow {
	id: string;
	runId: string;
	title: string;
	status: string;
	steps: PlanStepRow[];
}

export async function getActivePlan(db: D1Database, runId: string): Promise<PlanRow | null> {
	const kit = getDb(db);
	const [plan] = await kit
		.select()
		.from(agentPlans)
		.where(and(eq(agentPlans.runId, runId), eq(agentPlans.status, 'active')))
		.orderBy(desc(agentPlans.createdAt))
		.limit(1);
	if (!plan) return null;
	const steps = await kit
		.select()
		.from(agentPlanSteps)
		.where(eq(agentPlanSteps.planId, plan.id))
		.orderBy(asc(agentPlanSteps.ordinal));
	return {
		id: plan.id,
		runId: plan.runId,
		title: plan.title,
		status: plan.status,
		steps: steps.map((s) => ({
			id: s.id,
			ordinal: s.ordinal,
			label: s.label,
			status: s.status as PlanStepStatus,
			note: s.note
		}))
	};
}

/** idempotent full write: no active plan → create; exists → diff-update by ordinal (label change = full re-plan) */
export async function upsertPlan(
	db: D1Database,
	opts: {
		runId: string;
		sessionId: string;
		title: string;
		steps: { ordinal: number; label: string; status: PlanStepStatus; note?: string }[];
	}
): Promise<{
	planId: string;
	created: boolean;
	events: { type: string; payload: Record<string, unknown> }[];
}> {
	const kit = getDb(db);
	const existing = await getActivePlan(db, opts.runId);
	const events: { type: string; payload: Record<string, unknown> }[] = [];
	if (!existing) {
		const [plan] = await kit
			.insert(agentPlans)
			.values({ runId: opts.runId, sessionId: opts.sessionId, title: opts.title })
			.returning({ id: agentPlans.id });
		if (opts.steps.length) {
			await kit.insert(agentPlanSteps).values(
				opts.steps.map((s) => ({
					planId: plan.id,
					ordinal: s.ordinal,
					label: s.label,
					status: s.status,
					note: s.note ?? ''
				}))
			);
		}
		events.push({
			type: 'plan.created',
			payload: {
				planId: plan.id,
				title: opts.title,
				steps: opts.steps.map((s) => ({
					ordinal: s.ordinal,
					label: s.label,
					status: s.status
				}))
			}
		});
		return { planId: plan.id, created: true, events };
	}

	// re-plan: any label-set difference → discard & rebuild; status/note-only changes → update in place
	const sameLabels =
		existing.steps.length === opts.steps.length &&
		existing.steps.every(
			(s, i) => s.label === opts.steps[i]?.label && s.ordinal === opts.steps[i]?.ordinal
		);
	if (!sameLabels) {
		await kit
			.update(agentPlans)
			.set({ status: 'superseded', updatedAt: new Date() })
			.where(eq(agentPlans.id, existing.id));
		const [plan] = await kit
			.insert(agentPlans)
			.values({ runId: opts.runId, sessionId: opts.sessionId, title: opts.title })
			.returning({ id: agentPlans.id });
		await kit.insert(agentPlanSteps).values(
			opts.steps.map((s) => ({
				planId: plan.id,
				ordinal: s.ordinal,
				label: s.label,
				status: s.status,
				note: s.note ?? ''
			}))
		);
		events.push({
			type: 'plan.created',
			payload: {
				planId: plan.id,
				title: opts.title,
				steps: opts.steps.map((s) => ({
					ordinal: s.ordinal,
					label: s.label,
					status: s.status
				}))
			}
		});
		return { planId: plan.id, created: true, events };
	}

	for (const s of opts.steps) {
		const cur = existing.steps.find((x) => x.ordinal === s.ordinal);
		if (!cur) continue;
		const note = s.note ?? '';
		if (cur.status !== s.status || cur.note !== note) {
			await kit
				.update(agentPlanSteps)
				.set({ status: s.status, note, updatedAt: new Date() })
				.where(eq(agentPlanSteps.id, cur.id));
		}
	}
	if (opts.title && opts.title !== existing.title) {
		await kit
			.update(agentPlans)
			.set({ title: opts.title, updatedAt: new Date() })
			.where(eq(agentPlans.id, existing.id));
	}
	if (opts.steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
		await kit
			.update(agentPlans)
			.set({ status: 'done', updatedAt: new Date() })
			.where(eq(agentPlans.id, existing.id));
	}
	events.push({
		type: 'plan.updated',
		payload: {
			planId: existing.id,
			steps: opts.steps.map((s) => ({
				ordinal: s.ordinal,
				label: s.label,
				status: s.status,
				note: s.note ?? ''
			}))
		}
	});
	return { planId: existing.id, created: false, events };
}

/* ---- tool calls & approvals ---- */

export interface ToolCallRow {
	id: string;
	runId: string;
	step: number;
	providerCallId: string;
	name: string;
	args: Record<string, unknown>;
	risk: Risk;
	status: string;
	summary: string;
	result: string | null;
}

/** arg normalization (key-sorted JSON) for duplicate detection */
export function canonicalArgs(args: Record<string, unknown>): string {
	try {
		return JSON.stringify(args, Object.keys(args).sort());
	} catch {
		return '';
	}
}

/**
 * 31.3 Doom loop (OpenCode DOOM_LOOP_THRESHOLD isomorph):
 * the last n dispatched tool calls in the session are all the same tool + same args → true.
 */
export async function doomLoopHit(
	db: D1Database,
	sessionId: string,
	name: string,
	args: Record<string, unknown>,
	threshold = 3
): Promise<boolean> {
	const kit = getDb(db);
	const rows = await kit
		.select({ name: agentToolCalls.name, args: agentToolCalls.args })
		.from(agentToolCalls)
		.innerJoin(agentRuns, eq(agentToolCalls.runId, agentRuns.id))
		.where(eq(agentRuns.sessionId, sessionId))
		.orderBy(desc(agentToolCalls.id))
		.limit(threshold);
	if (rows.length < threshold) return false;
	const ca = canonicalArgs(args);
	return rows.every((r) => {
		if (r.name !== name) return false;
		try {
			return canonicalArgs(JSON.parse(r.args) as Record<string, unknown>) === ca;
		} catch {
			return false;
		}
	});
}

export async function createToolCall(
	db: D1Database,
	tc: {
		runId: string;
		step: number;
		providerCallId: string;
		name: string;
		args: Record<string, unknown>;
		risk: Risk;
		status: string;
		summary: string;
	}
): Promise<ToolCallRow> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentToolCalls)
		.values({
			runId: tc.runId,
			step: tc.step,
			providerCallId: tc.providerCallId,
			name: tc.name,
			args: JSON.stringify(tc.args),
			risk: tc.risk,
			status: tc.status,
			summary: tc.summary
		})
		.returning();
	return toToolCall(row);
}

export async function completeToolCall(
	db: D1Database,
	id: string,
	set: { status: string; result: string }
): Promise<void> {
	const kit = getDb(db);
	await kit
		.update(agentToolCalls)
		.set({ ...set, completedAt: new Date() })
		.where(eq(agentToolCalls.id, id));
}

/** change tool_call status (doesn't touch completion time; for 'queued' deferral & digestion write-back) */
export async function setToolCallStatus(db: D1Database, id: string, status: string): Promise<void> {
	const kit = getDb(db);
	await kit.update(agentToolCalls).set({ status }).where(eq(agentToolCalls.id, id));
}

/** queue digestion at advance start: take up to limit 'queued' rows in creation order */
export async function listQueuedCalls(
	db: D1Database,
	runId: string,
	limit: number
): Promise<ToolCallRow[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentToolCalls)
		.where(and(eq(agentToolCalls.runId, runId), eq(agentToolCalls.status, 'queued')))
		.orderBy(asc(agentToolCalls.createdAt))
		.limit(limit);
	return rows.map(toToolCall);
}

/** any 'queued' left undigested? */
export async function hasQueuedCalls(db: D1Database, runId: string): Promise<boolean> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ id: agentToolCalls.id })
		.from(agentToolCalls)
		.where(and(eq(agentToolCalls.runId, runId), eq(agentToolCalls.status, 'queued')))
		.limit(1);
	return Boolean(row);
}

export async function getToolCall(db: D1Database, id: string): Promise<ToolCallRow | null> {
	const kit = getDb(db);
	const [row] = await kit.select().from(agentToolCalls).where(eq(agentToolCalls.id, id)).limit(1);
	return row ? toToolCall(row) : null;
}

export async function markToolCallsSuperseded(
	db: D1Database,
	sessionId: string,
	exceptRunId: string
): Promise<void> {
	const kit = getDb(db);
	const runs = await listRuns(db, sessionId);
	const ids = runs.filter((r) => r.id !== exceptRunId).map((r) => r.id);
	if (!ids.length) return;
	await kit
		.update(agentToolCalls)
		.set({ status: 'superseded', completedAt: new Date() })
		.where(
			and(
				inArray(agentToolCalls.runId, ids),
				or(
					eq(agentToolCalls.status, 'pending_approval'),
					eq(agentToolCalls.status, 'client_pending')
				)
			)
		);
}

function toToolCall(r: typeof agentToolCalls.$inferSelect): ToolCallRow {
	let args: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(r.args);
		if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
	} catch {
		args = {};
	}
	return {
		id: r.id,
		runId: r.runId,
		step: r.step,
		providerCallId: r.providerCallId,
		name: r.name,
		args,
		risk: r.risk as Risk,
		status: r.status,
		summary: r.summary,
		result: r.result
	};
}

export interface ApprovalRow {
	id: string;
	runId: string;
	toolCallId: string;
	status: string;
}

export async function createApproval(
	db: D1Database,
	a: { runId: string; toolCallId: string }
): Promise<ApprovalRow> {
	const kit = getDb(db);
	const [row] = await kit
		.insert(agentApprovals)
		.values({ runId: a.runId, toolCallId: a.toolCallId })
		.returning();
	return { id: row.id, runId: row.runId, toolCallId: row.toolCallId, status: row.status };
}

export async function pendingApprovalsOfRun(
	db: D1Database,
	runId: string
): Promise<{ approval: ApprovalRow; call: ToolCallRow }[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentApprovals)
		.where(and(eq(agentApprovals.runId, runId), eq(agentApprovals.status, 'pending')));
	const out: { approval: ApprovalRow; call: ToolCallRow }[] = [];
	for (const r of rows) {
		const call = await getToolCall(db, r.toolCallId);
		if (call)
			out.push({
				approval: { id: r.id, runId: r.runId, toolCallId: r.toolCallId, status: r.status },
				call
			});
	}
	return out;
}

/** decide an approval (false = missing or already decided; one-shot anti-replay) */
export async function decideApproval(
	db: D1Database,
	approvalId: string,
	decision: 'approved' | 'denied',
	decidedBy: string
): Promise<ApprovalRow | null> {
	const kit = getDb(db);
	const [existing] = await kit
		.select()
		.from(agentApprovals)
		.where(eq(agentApprovals.id, approvalId))
		.limit(1);
	if (!existing || existing.status !== 'pending') return null;
	await kit
		.update(agentApprovals)
		.set({ status: decision, decidedBy, decidedAt: new Date() })
		.where(eq(agentApprovals.id, approvalId));
	return {
		id: existing.id,
		runId: existing.runId,
		toolCallId: existing.toolCallId,
		status: decision
	};
}

export async function listClientPendingCalls(
	db: D1Database,
	runId: string
): Promise<ToolCallRow[]> {
	const kit = getDb(db);
	const rows = await kit
		.select()
		.from(agentToolCalls)
		.where(and(eq(agentToolCalls.runId, runId), eq(agentToolCalls.status, 'client_pending')));
	return rows.map(toToolCall);
}

/** run still has pending approvals? */
export async function hasPendingApprovals(db: D1Database, runId: string): Promise<boolean> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ id: agentApprovals.id })
		.from(agentApprovals)
		.where(and(eq(agentApprovals.runId, runId), eq(agentApprovals.status, 'pending')))
		.limit(1);
	return Boolean(row);
}
