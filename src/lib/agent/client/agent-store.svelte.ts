/**
 * Floating Agent client runtime (Phase 24) — UI lifecycle decoupled from execution.
 *
 * Reducer architecture: all UI state reduces from event replay/tailing —
 *  POST /run|/advance SSE and the EventSource /events tail share one reducer,
 *  de-duplicated idempotently by event id. Hence: closing the window, switching pages,
 *  reopening the browser are all lossless; multiple same-site tabs sync automatically
 *  (EventSource resumes via Last-Event-ID cursor).
 */
import { untrack } from 'svelte';
import { invalidateAll } from '$app/navigation';
import type {
	AgentContext,
	AgentMode,
	PersistedEvent,
	PlanStepStatus,
	RunStatus
} from '$lib/agent/runtime/types';

/* ---- render model ---- */

export type ChatItem =
	| { kind: 'user'; id: number; text: string }
	| { kind: 'assistant'; id: number; text: string }
	| { kind: 'reasoning'; id: number; text: string; expanded: boolean; running: boolean }
	| {
			kind: 'tool';
			id: number;
			callId: string;
			name: string;
			risk: string;
			summary: string;
			state: 'running' | 'ok' | 'fail' | 'waiting' | 'denied';
			preview: string;
			full?: { args: unknown; result: string | null } | null;
			fullLoading?: boolean;
	  }
	| {
			kind: 'approval';
			id: number;
			approvalId: string;
			name: string;
			summary: string;
			risk: string;
			state: 'pending' | 'approved' | 'rejected';
			argsPreview?: string;
	  }
	| {
			kind: 'plan';
			id: number;
			planId: string;
			title: string;
			steps: { ordinal: number; label: string; status: PlanStepStatus; note?: string }[];
	  }
	| { kind: 'notice'; id: number; text: string; tone: 'info' | 'warn' | 'error' };

export interface SessionRow {
	id: string;
	title: string;
	mode: AgentMode;
	modelRowId: string | null;
	project: string | null;
	agent?: string | null;
	updatedAt: number;
}

/** Agent-compiled candidate code → Workshop auto-apply bus */
export interface ApplySuggestion {
	id: string;
	name: string;
	code: string;
	props?: string;
	ts: number;
	consumed: boolean;
}

export interface ModelOption {
	id: string;
	name: string;
	isDefault: boolean;
	contextWindow: number | null;
	maxOutputTokens: number | null;
	reasoningBudget: number | null;
	apiContextWindow: number | null;
}

const LS = {
	pos: 'kk-agent-pos',
	session: 'kk-agent-active-session',
	mode: 'kk-agent-mode',
	model: 'kk-agent-model',
	role: 'kk-agent-role'
};

export interface AgentOption {
	name: string;
	description: string;
	baseMode: AgentMode;
	riskCeiling: string;
	color: string | null;
}

const nowId = (() => {
	let n = 0;
	return () => --n; // local negative ids (optimistic placeholders only; real events use positive cursors)
})();

class AgentRuntimeStore {
	/* environment context (injected by admin layout / Workshop) */
	context: AgentContext = $state({});

	/* window */
	open = $state(false);
	mobile = $state(false);
	pos = $state({ x: 0, y: 0 });

	/* data */
	sessions = $state<SessionRow[]>([]);
	models = $state<ModelOption[]>([]);
	activeId = $state<string | null>(null);
	/** mode stash when no session exists yet (selectable from the empty chip state) */
	pendingMode = $state<AgentMode | null>(null);
	/** Phase 32: selectable agents + chosen agent (null/undefined = built-in per mode) */
	agents = $state<AgentOption[]>([]);
	pendingAgent = $state<string | null>(null);
	items = $state<ChatItem[]>([]);
	runStatus = $state<RunStatus | 'idle'>('idle');
	activeRunId = $state<string | null>(null);
	/** H4: load finds running but no active stream → show the "resume/cancel" bar */
	stalledRun = $state<string | null>(null);
	thinking = $state(false);
	/** token usage of the latest run (for the dashboard) */
	lastRunTokens = $state(0);
	/** 35B: token breakdown of the latest run (input/output) */
	lastRunUsage = $state<{ inputs: number; outputs: number } | null>(null);
	/** content-tool successes → dirty-signal counter (watchable by E2E/debug) */
	contentDirtyTick = $state(0);
	busy = $state(false);
	/** delta counter (for auto-scroll watching) */
	streamTick = $state(0);
	/** component_dev compile-passed candidates (Workshop subscribes & applies; FIFO cap 8) */
	applies = $state<ApplySuggestion[]>([]);
	ready = $state(false);
	lastError = $state('');

	private seen = new Set<number>();
	private tail: EventSource | null = null;
	private pumping = false;
	private streamAbort: AbortController | null = null;
	private streamBuf: { kind: 'assistant'; id: number; text: string } | null = null;

	/* ---- lifecycle ---- */

	init(): void {
		if (this.ready) return;
		const stored = localStorage.getItem(LS.pos);
		if (stored) {
			try {
				this.pos = JSON.parse(stored);
			} catch {
				/* default */
			}
		}
		this.mobile = matchMedia('(max-width: 640px)').matches;
		this.open = localStorage.getItem('kk-agent-open') === '1';
		this.ready = true;
		void this.refreshSessions();
		void this.refreshModels();
		void this.loadAgents();
		const last = localStorage.getItem(LS.session);
		if (last) void this.selectSession(last, true);
	}

	setContext(ctx: AgentContext): void {
		// untrack: lets this method be called safely inside external $effects (reads old value without registering deps)
		this.context = { ...untrack(() => this.context), ...ctx };
	}

	async refreshSessions(project?: string | null): Promise<void> {
		const q = project ? `?project=${encodeURIComponent(project)}` : '';
		const res = await fetch(`/api/agent/sessions${q}`);
		if (!res.ok) return;
		const data = (await res.json()) as { sessions: SessionRow[] };
		this.sessions = data.sessions;
	}

	async refreshModels(): Promise<void> {
		const res = await fetch('/api/agent/models');
		if (!res.ok) return;
		const data = (await res.json()) as { models: ModelOption[] };
		this.models = data.models;
	}

	get activeSession(): SessionRow | undefined {
		return this.sessions.find((s) => s.id === this.activeId);
	}

	/** single source of truth for the panel chip and new-session default */
	/** display: current agent name (unselected = built-in name for the mode) */
	currentAgent(): string {
		return (
			this.activeSession?.agent ||
			this.pendingAgent ||
			localStorage.getItem(LS.role) ||
			({ chat: 'chat', plan: 'plan', agent: 'build' } as Record<AgentMode, string>)[
				this.currentMode()
			]
		);
	}

	currentMode(): AgentMode {
		return (
			this.activeSession?.mode ??
			this.pendingMode ??
			(localStorage.getItem(LS.mode) as AgentMode) ??
			'agent'
		);
	}

	async newSession(mode?: AgentMode, project?: string | null): Promise<string | null> {
		// a new session does NOT inherit the mode of an "old" in-flight session (that's display state); respects explicit args / pendingMode / global preference
		const role = this.pendingAgent ?? (localStorage.getItem(LS.role) || null);
		const roleDef = role ? this.agents.find((x) => x.name === role) : undefined;
		const m: AgentMode =
			mode ??
			this.pendingMode ??
			roleDef?.baseMode ??
			(localStorage.getItem(LS.mode) as AgentMode) ??
			'agent';
		const modelRowId = localStorage.getItem(LS.model) || null;
		const res = await fetch('/api/agent/sessions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				mode: m,
				modelRowId,
				project: project ?? null,
				agent: mode ? null : role
			})
		});
		if (!res.ok) {
			this.lastError = `建立 Session 失敗（${res.status}）`;
			return null;
		}
		const data = (await res.json()) as { session: SessionRow };
		// takes effect immediately (sync) so a following send() can't use a stale activeId (await race)
		this.activeId = data.session.id;
		localStorage.setItem(LS.session, data.session.id);
		await this.refreshSessions();
		await this.selectSession(data.session.id);
		return data.session.id;
	}

	async selectSession(id: string | null, restore = false): Promise<void> {
		if (this.tail) {
			this.tail.close();
			this.tail = null;
		}
		this.streamAbort?.abort();
		this.streamAbort = null;
		this.activeId = id;
		this.items = [];
		this.streamBuf = null;
		this.reasonItemId = null;
		this.seen.clear();
		this.runStatus = 'idle';
		this.activeRunId = null;
		this.thinking = false;
		void restore;
		localStorage.setItem(LS.session, id ?? '');
		if (!id) return;
		const res = await fetch(`/api/agent/sessions/${id}`);
		if (!res.ok) return;
		const detail = (await res.json()) as {
			session: SessionRow;
			activeRun: { id: string; status: RunStatus } | null;
			plan: {
				id: string;
				title: string;
				steps: { ordinal: number; label: string; status: PlanStepStatus; note: string }[];
			} | null;
			pendingApprovals: {
				approvalId: string;
				callId: string;
				name: string;
				summary: string;
				risk: string;
				args?: Record<string, unknown>;
			}[];
		};
		if (detail.activeRun) {
			this.runStatus = detail.activeRun.status;
			this.activeRunId = detail.activeRun.id;
			if (detail.activeRun.status === 'running') this.stalledRun = detail.activeRun.id;
		}
		if (detail.plan) {
			this.items.push({
				kind: 'plan',
				id: nowId(),
				planId: detail.plan.id,
				title: detail.plan.title,
				steps: detail.plan.steps
			});
		}
		for (const a of detail.pendingApprovals) {
			this.items.push({
				kind: 'approval',
				id: nowId(),
				approvalId: a.approvalId,
				name: a.name,
				summary: a.summary,
				risk: a.risk,
				state: 'pending',
				argsPreview: a.args ? JSON.stringify(a.args).slice(0, 1500) : undefined
			});
		}
		this.openTail(id);
	}

	private openTail(sid: string): void {
		this.tail = new EventSource(`/api/agent/sessions/${sid}/events?cursor=0`);
		this.tail.onmessage = () => {
			/* named events go through addEventListener; this is only a fallback */
		};
		const handler = (ev: MessageEvent<string>) => {
			let parsed: { id: number; payload: Record<string, unknown> };
			try {
				parsed = JSON.parse(ev.data);
			} catch {
				return;
			}
			if (typeof parsed?.id !== 'number') return;
			this.applyEvent({
				id: parsed.id,
				sessionId: sid,
				runId: null,
				type: ev.type as PersistedEvent['type'],
				payload: parsed.payload,
				createdAt: Date.now()
			});
		};
		for (const type of EVENT_TYPES) {
			this.tail.addEventListener(type, handler as EventListener);
		}
		this.tail.addEventListener('stream.cursor', () => {
			/* the backend periodically closes connections; EventSource reconnects automatically */
		});
	}

	/* ---- event reducer (idempotent) ---- */

	private applyEvent(ev: PersistedEvent, scope?: string): void {
		if (this.seen.has(ev.id)) return;
		// stream guard: events from inactive sessions may only refresh the list on terminal states (prevents cross-session pollution)
		const owner = scope ?? ev.sessionId;
		if (owner && this.activeId && owner !== this.activeId) {
			if (ev.type === 'run.completed' || ev.type === 'run.failed' || ev.type === 'run.cancelled') {
				this.seen.add(ev.id);
				void this.refreshSessions();
			}
			return;
		}
		this.seen.add(ev.id);
		const p = ev.payload;
		switch (ev.type) {
			case 'run.started': {
				this.runStatus = 'running';
				this.activeRunId = String(p.runId ?? '');
				this.items.push({ kind: 'user', id: ev.id, text: String(p.input ?? '') });
				break;
			}
			case 'run.retry': {
				const a = String(p.attempt ?? 1);
				this.items.push({
					kind: 'notice',
					id: nowId(),
					text: `Provider 瞬時錯誤，自動重試中（第 ${a} 次）`,
					tone: 'warn'
				});
				break;
			}
			case 'context.compacted': {
				this.items.push({
					kind: 'notice',
					id: ev.id,
					text: `${p.auto ? '已自動壓縮' : '已壓縮'}上下文（摘要 ${String(p.summarized ?? '?')} 條・保留 ${String(p.kept ?? '?')} 條）`,
					tone: 'info'
				});
				break;
			}
			case 'message.completed': {
				const text = String(p.text ?? '');
				const preview = typeof p.reasoningPreview === 'string' ? p.reasoningPreview : '';
				if (preview) {
					const expand = !text; // empty final answer → expand thinking for the user
					const rid = this.reasonItemId ?? nowId();
					const idx = this.items.findIndex((x) => x.id === rid && x.kind === 'reasoning');
					const item: ChatItem = {
						kind: 'reasoning',
						id: rid,
						text: preview,
						expanded: expand,
						running: false
					};
					if (!text && idx < 0) {
						this.items.push({
							kind: 'notice',
							id: rid - 0.5,
							text: '模型輸出耗在思考上，沒有最終回覆——展開思考內容供參考',
							tone: 'warn'
						});
					}
					if (idx >= 0) this.items[idx] = item;
					else this.items.splice(this.items.length, 0, item);
					this.reasonItemId = null;
				} else if (this.reasonItemId) {
					this.finishReasoning();
				}
				if (this.streamBuf) {
					this.streamBuf = { ...this.streamBuf, text };
					const idx = this.items.findIndex((x) => x.id === this.streamBuf?.id);
					if (idx >= 0) this.items[idx] = this.streamBuf;
					this.streamBuf = null;
				} else if (text) {
					this.items.push({ kind: 'assistant', id: ev.id, text });
				}
				this.thinking = false;
				break;
			}
			case 'tool.started': {
				this.items.push({
					kind: 'tool',
					id: ev.id,
					callId: String(p.callId ?? ''),
					name: String(p.name ?? ''),
					risk: String(p.risk ?? 'medium'),
					summary: String(p.summary ?? ''),
					state: 'running',
					preview: ''
				});
				break;
			}
			case 'tool.completed': {
				if (p.ok && (CONTENT_TOOLS as readonly string[]).includes(String(p.name ?? '')))
					this.markContentDirty();
			}
			// fallthrough shares update logic
			case 'tool.failed': {
				const callId = String(p.callId ?? '');
				const idx = this.items.findLastIndex(
					(x) =>
						x.kind === 'tool' &&
						x.callId === callId &&
						(x.state === 'running' || x.state === 'waiting')
				);
				if (idx >= 0) {
					const x = this.items[idx];
					if (x.kind === 'tool') {
						this.items[idx] = {
							...x,
							state: ev.type === 'tool.completed' && p.ok ? 'ok' : 'fail',
							preview: String(p.resultPreview ?? p.error ?? '')
						};
					}
				}
				break;
			}
			case 'plan.created': {
				const steps = Array.isArray(p.steps)
					? (p.steps as { ordinal: number; label: string; status: PlanStepStatus }[])
					: [];
				const planId = String(p.planId ?? '');
				const ex = this.items.findLastIndex((x) => x.kind === 'plan' && x.planId === planId);
				if (ex >= 0) {
					const cur = this.items[ex];
					if (cur.kind === 'plan')
						this.items[ex] = { ...cur, steps: steps.length ? steps : cur.steps, id: ev.id };
				} else {
					this.items.push({ kind: 'plan', id: ev.id, planId, title: String(p.title ?? ''), steps });
				}
				break;
			}
			case 'plan.updated': {
				const planId = String(p.planId ?? '');
				const idx = this.items.findLastIndex((x) => x.kind === 'plan' && x.planId === planId);
				if (idx >= 0) {
					const x = this.items[idx];
					if (x.kind === 'plan') {
						this.items[idx] = {
							...x,
							steps: Array.isArray(p.steps)
								? (p.steps as {
										ordinal: number;
										label: string;
										status: PlanStepStatus;
										note?: string;
									}[])
								: x.steps
						};
					}
				}
				break;
			}
			case 'approval.required': {
				this.runStatus = 'waiting_approval';
				this.thinking = false;
				const aid = String(p.approvalId ?? '');
				if (this.items.some((x) => x.kind === 'approval' && x.approvalId === aid)) break;
				this.items.push({
					kind: 'approval',
					id: ev.id,
					approvalId: String(p.approvalId ?? ''),
					name: String(p.name ?? ''),
					summary: String(p.summary ?? ''),
					risk: String(p.risk ?? 'high'),
					state: 'pending',
					argsPreview: typeof p.argsPreview === 'string' ? p.argsPreview : undefined
				});
				break;
			}
			case 'approval.approved':
			case 'approval.rejected': {
				if (ev.type === 'approval.approved' && this.runStatus === 'waiting_approval') {
					this.runStatus = 'running'; // optimistic: later events take over
				}
				const aid = String(p.approvalId ?? '');
				const idx = this.items.findLastIndex((x) => x.kind === 'approval' && x.approvalId === aid);
				if (idx >= 0) {
					const x = this.items[idx];
					if (x.kind === 'approval') {
						this.items[idx] = {
							...x,
							state: ev.type === 'approval.approved' ? 'approved' : 'rejected'
						};
					}
				}
				break;
			}
			case 'client.exec.required': {
				this.items.push({
					kind: 'notice',
					id: ev.id,
					text: `等待瀏覽器驗證：${String(p.name ?? '')}`,
					tone: 'info'
				});
				const name = String(p.name ?? '');
				if (name === 'component_dev') {
					void this.dispatchComponentDev(
						String(p.callId ?? ''),
						String(p.runId ?? this.activeRunId ?? ''),
						(p.args ?? {}) as Record<string, unknown>,
						scope ?? this.activeId ?? undefined
					);
				}
				break;
			}
			case 'run.completed':
				this.runStatus = 'completed';
				this.stalledRun = null;
				this.thinking = false;
				this.lastRunTokens = Number(p.tokens ?? 0);
				this.lastRunUsage = { inputs: Number(p.inputs ?? 0), outputs: Number(p.outputs ?? 0) };
				this.finishReasoning();
				this.items.push({
					kind: 'notice',
					id: ev.id,
					text: `Run 完成（${String(p.steps ?? '?')} 步・${String(p.toolCalls ?? '?')} 工具・${Number(p.tokens ?? 0).toLocaleString()} tokens）`,
					tone: 'info'
				});
				void this.refreshSessions();
				break;
			case 'run.failed': {
				this.runStatus = 'failed';
				this.stalledRun = null;
				this.thinking = false;
				this.finishReasoning();
				this.items.push({
					kind: 'notice',
					id: ev.id,
					text: `Run 失敗：${String(p.error ?? '')}`,
					tone: 'error'
				});
				break;
			}
			case 'run.cancelled':
				this.runStatus = 'cancelled';
				this.stalledRun = null;
				this.thinking = false;
				this.items.push({ kind: 'notice', id: ev.id, text: 'Run 已取消', tone: 'warn' });
				break;
			default:
				break;
		}
	}

	private feedDelta(text: string): void {
		this.streamTick++;
		if (this.streamBuf) {
			this.streamBuf = { ...this.streamBuf, text: this.streamBuf.text + text };
			const idx = this.items.findIndex((x) => x.id === this.streamBuf?.id);
			if (idx >= 0) this.items[idx] = this.streamBuf;
			return;
		}
		const item: ChatItem = { kind: 'assistant', id: nowId(), text };
		this.streamBuf = item;
		this.items.push(item);
	}

	/* ---- reasoning stream (transient; becomes persistent preview after message.completed) ---- */

	private reasonItemId: number | null = null;

	private feedReasoning(text: string): void {
		if (!this.reasonItemId) {
			const item: ChatItem = {
				kind: 'reasoning',
				id: nowId(),
				text,
				expanded: false,
				running: true
			};
			this.reasonItemId = item.id;
			this.items.push(item);
			return;
		}
		const id = this.reasonItemId;
		const idx = this.items.findIndex((x) => x.id === id);
		if (idx >= 0) {
			const cur = this.items[idx];
			if (cur.kind === 'reasoning') this.items[idx] = { ...cur, text: cur.text + text };
		}
	}

	private finishReasoning(): void {
		if (!this.reasonItemId) return;
		const id = this.reasonItemId;
		const idx = this.items.findIndex((x) => x.id === id);
		if (idx >= 0) {
			const cur = this.items[idx];
			if (cur.kind === 'reasoning') this.items[idx] = { ...cur, running: false, expanded: false };
		}
		this.reasonItemId = null;
	}

	toggleReasoning(id: number): void {
		const idx = this.items.findIndex((x) => x.id === id);
		if (idx >= 0) {
			const cur = this.items[idx];
			if (cur.kind === 'reasoning') this.items[idx] = { ...cur, expanded: !cur.expanded };
		}
	}

	async compact(): Promise<void> {
		if (!this.activeId) return;
		const res = await fetch(`/api/agent/sessions/${this.activeId}/compact`, { method: 'POST' });
		if (!res.ok) {
			this.lastError = '壓縮失敗';
			return;
		}
		const data = (await res.json()) as { summarized?: number; kept?: number; note?: string };
		this.items.push({
			kind: 'notice',
			id: nowId(),
			text: data.note ?? `已壓縮上下文（摘要 ${data.summarized} 條・保留 ${data.kept} 條）`,
			tone: 'info'
		});
	}

	/* ---- browser-side execution: real component_dev compile validation ---- */

	private dispatching = new Set<string>();

	private async dispatchComponentDev(
		callId: string,
		runId: string,
		args: Record<string, unknown>,
		scope?: string
	): Promise<void> {
		if (!callId || !runId || this.dispatching.has(callId)) return;
		this.dispatching.add(callId);
		let ok = false;
		let result: string;
		try {
			const name = String(args.name ?? 'anon');
			const code = String(args.code ?? '');
			const { compileComponentSource } = await import('$lib/workshop/compile');
			const c = await compileComponentSource(name, code);
			if (c.ok) {
				ok = true;
				result = JSON.stringify({
					compiled: true,
					cssBytes: c.css?.length ?? 0,
					warnings: (c.warnings ?? []).slice(0, 8),
					note: 'Svelte 編譯與實例化成功'
				});
				const propsArg = typeof args.props === 'string' ? args.props : undefined;
				this.applies = [
					...this.applies.slice(-7),
					{
						id: callId,
						name,
						code,
						...(propsArg ? { props: propsArg } : {}),
						ts: Date.now(),
						consumed: false
					}
				];
			} else {
				result = JSON.stringify({ compiled: false, error: c.error });
			}
		} catch (e) {
			result = JSON.stringify({
				compiled: false,
				error: String(e instanceof Error ? e.message : e)
			});
		}
		this.dispatching.delete(callId);
		try {
			const res = await fetch(`/api/agent/runs/${runId}/advance`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ clientResults: [{ callId, ok, result }] })
			});
			const fin = await this.consumeStream(res, scope);
			if (fin?.status === 'running') await this.pumpToBoundary(runId);
		} catch {
			/* the run may already be cancelled; ignore */
		}
	}

	/* ---- advance (POST SSE + auto-pump to boundary) ---- */

	private async consumeStream(
		res: Response,
		scope?: string
	): Promise<{ status: string; runId?: string } | null> {
		if (!res.body) return null;
		const dec = new TextDecoder();
		let buf = '';
		let final: { status: string; runId?: string } | null = null;
		const feed = (block: string) => {
			const type = /^event: (.+)$/m.exec(block)?.[1];
			const dm = /^data: (.*)$/m.exec(block);
			if (!type || !dm) return;
			let parsed: { id?: number; payload?: Record<string, unknown> } | Record<string, unknown>;
			try {
				parsed = JSON.parse(dm[1]) as typeof parsed;
			} catch {
				return;
			}
			if (type === 'message.delta') {
				this.feedDelta(String((parsed as { text?: string }).text ?? ''));
				return;
			}
			if (type === 'reasoning.delta') {
				this.feedReasoning(String((parsed as { text?: string }).text ?? ''));
				return;
			}
			if (type === 'stream.close') {
				const q = parsed as { status?: string; runId?: string };
				final = { status: String(q.status ?? 'running'), runId: q.runId };
				return;
			}
			if (type === 'stream.error') {
				const q = parsed as { error?: string };
				this.lastError = String(q.error ?? 'agent error');
				this.items.push({ kind: 'notice', id: nowId(), text: this.lastError, tone: 'error' });
				// session_busy: previous run holds the slot → show the self-rescue bar (cancel to unlock)
				if (this.lastError.includes('session_busy') && this.activeRunId)
					this.stalledRun = this.activeRunId;
				final = { status: 'failed' };
				return;
			}
			if (typeof (parsed as { id?: number }).id === 'number') {
				this.applyEvent(
					{
						id: (parsed as { id: number }).id,
						sessionId: scope ?? this.activeId ?? '',
						runId: null,
						type: type as PersistedEvent['type'],
						payload: (parsed as { payload: Record<string, unknown> }).payload ?? {},
						createdAt: Date.now()
					},
					scope
				);
			}
		};
		const reader = res.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buf += dec.decode(value, { stream: true });
			let i: number;
			while ((i = buf.indexOf('\n\n')) !== -1) {
				const block = buf.slice(0, i);
				buf = buf.slice(i + 2);
				feed(block);
			}
		}
		if (buf.trim()) feed(buf);
		return final;
	}

	private async pumpToBoundary(runId: string): Promise<void> {
		this.pumping = true;
		try {
			for (;;) {
				if (this.runStatus !== 'running') break;
				const res = await fetch(`/api/agent/runs/${runId}/advance`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}'
				});
				const fin = await this.consumeStream(res, this.activeId ?? undefined);
				if (!fin || fin.status === 'running') {
					if (fin?.status !== 'running') break;
					continue; // still running → keep pumping
				}
				break; // waiting_* / terminal
			}
		} finally {
			this.pumping = false;
		}
	}

	async send(text: string, sessionOverride?: string): Promise<void> {
		const input = text.trim();
		if (!input || this.busy) return;
		this.busy = true;
		this.lastError = '';
		this.thinking = true;
		try {
			let sid = sessionOverride ?? this.activeId;
			if (!sid) sid = await this.newSession();
			if (!sid) return;
			const res = await fetch(`/api/agent/sessions/${sid}/run`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ input, context: this.context })
			});
			const fin = await this.consumeStream(res);
			if (!fin) {
				// H5: stream interrupted without a terminal state → say so and enter the stuck-rescue bar
				this.lastError = '連線中斷——run 可能仍在進行，可用「⟳ 繼續執行」接續';
				this.items.push({ kind: 'notice', id: nowId(), text: this.lastError, tone: 'warn' });
				if (this.activeRunId) this.stalledRun = this.activeRunId;
				return;
			}
			const runId = fin.runId ?? this.activeRunId ?? '';
			if (fin.status === 'running' && runId && !this.pumping) {
				await this.pumpToBoundary(runId);
			}
		} catch (e) {
			this.lastError = String(e instanceof Error ? e.message : e);
		} finally {
			this.busy = false;
			this.thinking = false;
			this.streamAbort = null;
		}
	}

	async decide(approvalId: string, approve: boolean, always = false): Promise<void> {
		if (this.busy || !this.activeRunId) return;
		this.busy = true;
		const runId = this.activeRunId;
		try {
			this.streamAbort = new AbortController();
			const res = await fetch(`/api/agent/runs/${runId}/advance`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ decisions: [{ approvalId, approve, always }] }),
				signal: this.streamAbort.signal
			});
			const fin = await this.consumeStream(res, this.activeId ?? undefined);
			if (fin?.status === 'running') await this.pumpToBoundary(runId);
		} finally {
			this.busy = false;
		}
	}

	/** 38B: lazily fetch full args+result when a tool card expands (cached on the item) */
	async loadToolDetail(itemId: number): Promise<void> {
		const sid = this.activeId;
		if (!sid) return;
		const idx = this.items.findIndex((x) => x.kind === 'tool' && x.id === itemId);
		if (idx < 0) return;
		const it = this.items[idx];
		if (it.kind !== 'tool' || it.full || it.fullLoading || !it.callId) return;
		this.items[idx] = { ...it, fullLoading: true };
		try {
			const res = await fetch(
				`/api/agent/sessions/${sid}/tool-calls/${encodeURIComponent(it.callId)}`
			);
			if (!res.ok) throw new Error(String(res.status));
			const j = (await res.json()) as { args: unknown; result: string | null };
			const cur = this.items[idx];
			if (cur.kind === 'tool')
				this.items[idx] = { ...cur, full: { args: j.args, result: j.result }, fullLoading: false };
		} catch {
			const cur = this.items[idx];
			if (cur.kind === 'tool') this.items[idx] = { ...cur, fullLoading: false };
		}
	}

	/** 35B: retry the latest user message (one-click resume after failure/interruption) */
	async retryLast(): Promise<void> {
		if (this.busy) return;
		for (let i = this.items.length - 1; i >= 0; i--) {
			const it = this.items[i];
			if (it.kind === 'user' && it.text.trim()) {
				await this.send(it.text);
				return;
			}
		}
	}

	async cancel(): Promise<void> {
		if (!this.activeRunId) return;
		this.streamAbort?.abort();
		this.streamAbort = null;
		await fetch(`/api/agent/runs/${this.activeRunId}/cancel`, { method: 'POST' });
		this.stalledRun = null;
		await this.refreshSessions();
	}

	/** H4: resume a stuck/interrupted run (pump /advance to continue) */
	async resumeStalled(): Promise<void> {
		const runId = this.stalledRun ?? this.activeRunId;
		if (!runId || this.busy) return;
		this.stalledRun = null;
		this.busy = true;
		this.thinking = true;
		this.lastError = '';
		try {
			this.streamAbort = new AbortController();
			const res = await fetch(`/api/agent/runs/${runId}/advance`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({}),
				signal: this.streamAbort.signal
			});
			const fin = await this.consumeStream(res, this.activeId ?? undefined);
			if (fin?.status === 'running' && !this.pumping) await this.pumpToBoundary(runId);
		} catch (e) {
			this.lastError = String(e instanceof Error ? e.message : e);
		} finally {
			this.busy = false;
			this.thinking = false;
			this.streamAbort = null;
		}
	}

	async rename(id: string, title: string): Promise<void> {
		await fetch(`/api/agent/sessions/${id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title })
		});
		await this.refreshSessions();
	}

	async remove(id: string): Promise<void> {
		await fetch(`/api/agent/sessions/${id}`, { method: 'DELETE' });
		if (this.activeId === id) await this.selectSession(null);
		await this.refreshSessions();
	}

	async loadAgents(): Promise<void> {
		try {
			const r = await fetch('/api/agent/agents');
			if (!r.ok) return;
			const data = (await r.json()) as { agents: AgentOption[] };
			this.agents = data.agents ?? [];
		} catch {
			/* offline / not ready: degrade to the built-in three stages */
		}
	}

	/** select agent (OpenCode primary-agent switch): also switches to its base mode */
	async setAgent(name: string): Promise<void> {
		const a = this.agents.find((x) => x.name === name);
		if (!a) return;
		localStorage.setItem(LS.role, name);
		this.pendingAgent = name;
		this.pendingMode = a.baseMode;
		if (!this.activeId) return;
		const res = await fetch(`/api/agent/sessions/${this.activeId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ agent: name, mode: a.baseMode })
		});
		if (!res.ok) return;
		const data = (await res.json()) as { session: SessionRow };
		this.sessions = this.sessions.map((x) => (x.id === data.session.id ? data.session : x));
	}

	async setMode(mode: AgentMode): Promise<void> {
		localStorage.setItem(LS.mode, mode);
		this.pendingMode = mode; // reflected in the chip instantly even without a session
		if (!this.activeId) return;
		const res = await fetch(`/api/agent/sessions/${this.activeId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ mode })
		});
		if (!res.ok) return;
		const data = (await res.json()) as { session: SessionRow };
		this.sessions = this.sessions.map((s) => (s.id === data.session.id ? data.session : s));
	}

	async setModel(modelRowId: string): Promise<void> {
		localStorage.setItem(LS.model, modelRowId);
		if (!this.activeId) return;
		await fetch(`/api/agent/sessions/${this.activeId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ modelRowId })
		});
		await this.refreshSessions();
	}

	savePos(): void {
		localStorage.setItem(LS.pos, JSON.stringify(this.pos));
	}

	setOpen(v: boolean): void {
		this.open = v;
		localStorage.setItem('kk-agent-open', v ? '1' : '0');
	}

	destroy(): void {
		this.tail?.close();
	}

	/** content changed → invalidateAll this tab (debounced) + cross-tab broadcast */
	private dirtyTimer: ReturnType<typeof setTimeout> | undefined;

	markContentDirty(): void {
		this.contentDirtyTick++;
		clearTimeout(this.dirtyTimer);
		this.dirtyTimer = setTimeout(() => {
			void invalidateAll();
			try {
				new BroadcastChannel(AGENT_CONTENT_CHANNEL).postMessage({ t: Date.now() });
			} catch {
				/* silently degrade when unsupported */
			}
		}, 500);
	}
}

export const AGENT_CONTENT_CHANNEL = 'kk-agent-content';

/** tools that change publicly visible content (Phase 28 W0-3) */
export const CONTENT_TOOLS = [
	'save_translation',
	'save_tag_translation',
	'save_page',
	'create_page',
	'create_post',
	'update_markdown',
	'publish_post',
	'create_tag',
	'delete_post',
	'create_component',
	'update_component'
] as const;

const EVENT_TYPES = [
	'run.started',
	'message.completed',
	'plan.created',
	'plan.updated',
	'tool.started',
	'tool.completed',
	'tool.failed',
	'approval.required',
	'approval.approved',
	'approval.rejected',
	'client.exec.required',
	'client.exec.result',
	'reasoning.delta',
	'message.started',
	'run.completed',
	'run.failed',
	'run.cancelled'
] as const;

export const agent = new AgentRuntimeStore();

if (import.meta.env?.DEV && typeof window !== 'undefined') {
	// @ts-expect-error test hook
	window.__agent = agent;
}
