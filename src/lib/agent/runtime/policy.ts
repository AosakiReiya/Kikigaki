/**
 * Approval policy & limiters (pure logic, zero deps = unit-testable).
 *
 * Mode semantics (affect runtime behavior, not UI labels):
 *   chat  — read tools only; no proposals, no side effects.
 *   plan  — read + update_plan run directly; every side-effect tool (incl. low/medium)
 *            becomes an approval proposal (Understand→Inspect→Plan→Approval→Execute).
 *   agent — read/low/medium execute autonomously; high/critical always _pause_ for a human.
 *
 * critical needs human approval in every mode; review-approval (registry publishing) is
 * deliberately NOT exposed as an agent tool — humans are the last line of defense.
 */
import type { AgentMode, Risk } from './types';

export interface ToolAccess {
	/** tools listed to the model under this mode (false = removed from the tools spec) */
	visible: boolean;
	/** visible but requires human approval to execute (becomes a proposal) */
	needsApproval: boolean;
	/** execute directly */
	autoExecute: boolean;
}

export function toolAccess(mode: AgentMode, risk: Risk, special = false): ToolAccess {
	if (mode === 'chat') {
		const visible = risk === 'read';
		return { visible, needsApproval: false, autoExecute: visible };
	}
	if (mode === 'plan') {
		if (risk === 'read') return { visible: true, needsApproval: false, autoExecute: true };
		// meta tools (update_plan etc., side-effect free) run directly
		if (special) return { visible: true, needsApproval: false, autoExecute: true };
		return { visible: true, needsApproval: true, autoExecute: false };
	}
	// agent
	if (risk === 'high' || risk === 'critical') {
		return { visible: true, needsApproval: true, autoExecute: false };
	}
	return { visible: true, needsApproval: false, autoExecute: true };
}

/**
 * Workshop collaboration discipline: in the IDE context, registry registration (create/update_component)
 * is a milestone action — even in agent mode's medium auto-threshold it always becomes an approval.
 */
export function gatedForWorkshop(toolName: string, workshop: boolean): boolean {
	return workshop && (toolName === 'create_component' || toolName === 'update_component');
}

/* ---- limiters (infinite-loop / runaway-cost guards) ---- */

export interface RunLimits {
	maxSteps: number;
	maxToolCalls: number;
	maxTokenBudget: number;
	maxWallMs: number;
	maxConsecutiveFailures: number;
}

export const DEFAULT_RUN_LIMITS: RunLimits = {
	maxSteps: 24,
	maxToolCalls: 60,
	maxTokenBudget: 200_000,
	maxWallMs: 30 * 60_000,
	maxConsecutiveFailures: 4
};

export interface RunCounters {
	stepsUsed: number;
	toolCallsUsed: number;
	totalTokens: number;
	wallMs: number;
	consecutiveFailures: number;
}

/** returns the exceeded-limit reason (null = still within budget). First failure reported first. */
export function budgetExceeded(c: RunCounters, l: RunLimits): string | null {
	if (c.stepsUsed >= l.maxSteps) return 'step_budget_exceeded';
	if (c.toolCallsUsed >= l.maxToolCalls) return 'tool_call_budget_exceeded';
	if (c.totalTokens >= l.maxTokenBudget) return 'token_budget_exceeded';
	if (c.wallMs >= l.maxWallMs) return 'wall_clock_exceeded';
	if (c.consecutiveFailures >= l.maxConsecutiveFailures) return 'consecutive_failures';
	return null;
}

/** self-host (node, see node-shim/install.mjs) = no Workers CPU/subrequest caps */
export function isSelfHost(): boolean {
	return typeof process !== 'undefined' && process.env?.SELF_HOST === '1';
}

/** max provider steps per HTTP advance (the rest continue via client pumping).
 *  Cloudflare Free = 1: budget goes to 10ms CPU and 50 subrequests; fixed costs spread over requests;
 *  self-host = 10: same architecture unthrottled (77c); total step budget maxSteps unchanged */
export function stepsPerAdvance(): number {
	if (!isSelfHost()) return 1;
	// deployments behind reverse proxies (Caddy/nginx, default 60s proxy timeout) may lower this (e.g. 5)
	const n = Number(process.env?.SELF_HOST_STEPS ?? 10);
	return Number.isFinite(n) && n >= 1 ? Math.min(25, Math.round(n)) : 10;
}

/** max auto-executed tools per request; extras become 'queued' for the next advance to digest first */
export function maxAutoToolsPerRequest(): number {
	return isSelfHost() ? 12 : 4;
}

/** pure split (testable): first cap execute immediately, rest deferred */
export function planAutoBatch<T>(
	queue: T[],
	cap: number = maxAutoToolsPerRequest()
): {
	execute: T[];
	deferred: T[];
} {
	if (queue.length <= cap) return { execute: queue, deferred: [] };
	return { execute: queue.slice(0, cap), deferred: queue.slice(cap) };
}

/** concurrency guard: max non-terminal runs per session */
export const MAX_ACTIVE_RUNS_PER_SESSION = 1;
