/**
 * Agent Runtime shared types (pure type file: safe to import from UI and server).
 * Phase 23: event-sourced state machine. Session / Run / Message / Event / Plan /
 * ToolCall / Approval are all independently manageable runtime entities.
 */

export type AgentMode = 'chat' | 'plan' | 'agent';

/** five risk tiers (declared in the tool registry; approval policy uses these + mode) */
export type Risk = 'read' | 'low' | 'medium' | 'high' | 'critical';

export const ALL_RISKS: Risk[] = ['read', 'low', 'medium', 'high', 'critical'];

export const MODES: AgentMode[] = ['chat', 'plan', 'agent'];

export type RunStatus =
	| 'queued'
	| 'running'
	| 'waiting_approval'
	| 'waiting_client'
	| 'completed'
	| 'failed'
	| 'cancelled';

export const TERMINAL_RUN_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

export type PlanStepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export type ToolCallStatus =
	'pending_approval' | 'client_pending' | 'executed' | 'failed' | 'denied' | 'superseded';

/** environment context (Floating Agent / Workshop send with messages; snapshotted at run creation) */
export interface AgentContext {
	route?: string;
	locale?: string;
	/** Workshop-selected component (name + current draft code) */
	selectedComponent?: { name: string; code?: string; description?: string };
	/** Workshop text selection */
	selectedText?: string;
	/** email-template editor selection (incl. unsaved draft; Phase 71) */
	emailTemplate?: {
		slug: string;
		name: string;
		type: string;
		version: number;
		subject: string;
		source: string;
		dirty: boolean;
	};
	/** theme workbench selection (incl. unsaved draft; Phase 78c) */
	themeEditing?: {
		id: string;
		label: string;
		base: string;
		version: number;
		tokens: string;
		surfaces: Record<string, { code: string; css?: string }>;
		behaviors?: Record<string, unknown>;
		dirty: boolean;
	};
	pageSlug?: string;
	postSlug?: string;
	project?: string;
}

/* ---- events (persisted types; message.delta is transient, SSE-only, never hits D1) ---- */

export interface AgentEventPayloads {
	'run.started': { runId: string; sessionId: string; input: string; mode: AgentMode };
	'message.started': { role: 'assistant' };
	'message.completed': { text: string; runId: string | null; reasoningPreview?: string };
	'plan.created': {
		planId: string;
		title: string;
		steps: { ordinal: number; label: string; status: PlanStepStatus }[];
	};
	'plan.updated': {
		planId: string;
		steps: { ordinal: number; label: string; status: PlanStepStatus; note: string }[];
	};
	'tool.started': { callId: string; name: string; risk: Risk; summary: string };
	'tool.completed': { callId: string; name: string; ok: boolean; resultPreview: string };
	'tool.failed': { callId: string; name: string; error: string };
	'approval.required': {
		approvalId: string;
		callId: string;
		name: string;
		summary: string;
		risk: Risk;
		argsPreview?: string;
	};
	'approval.approved': { approvalId: string; callId: string };
	'approval.rejected': { approvalId: string; callId: string; cascade?: boolean };
	'client.exec.required': {
		callId: string;
		runId: string;
		name: string;
		args: Record<string, unknown>;
	};
	'reasoning.delta': { text: string };
	'context.compacted': { summarized: number; kept: number; auto: boolean };
	'run.retry': { attempt: number; delayMs: number; reason: string };
	'client.exec.result': { callId: string; ok: boolean; resultPreview: string };
	'run.completed': {
		steps: number;
		toolCalls: number;
		tokens: number;
		inputs: number;
		outputs: number;
	};
	'run.failed': { error: string };
	'run.cancelled': Record<string, never>;
}

export type AgentEventType = keyof AgentEventPayloads;

export interface PersistedEvent {
	id: number;
	sessionId: string;
	runId: string | null;
	type: AgentEventType;
	/** parsed payload (API layer restores the JSON) */
	payload: Record<string, unknown>;
	createdAt: number;
}

/* ---- run/session view DTOs for the UI ---- */

export interface RunView {
	id: string;
	sessionId: string;
	status: RunStatus;
	input: string;
	step: number;
	stepsUsed: number;
	toolCallsUsed: number;
	inputTokens: number;
	outputTokens: number;
	maxSteps: number;
	maxTokenBudget: number;
	error: string | null;
	cancelRequested: boolean;
	createdAt: number;
	finishedAt: number | null;
}

export interface PendingApprovalView {
	approvalId: string;
	callId: string;
	name: string;
	summary: string;
	risk: Risk;
	args: Record<string, unknown>;
}

export interface SessionSummary {
	id: string;
	title: string;
	mode: AgentMode;
	updatedAt: number;
	lastMessage?: string;
}
