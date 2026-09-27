/**
 * Agent Runtime engine (Phase 23) — stepping executor of the event-sourced state machine.
 *
 * Design: one HTTP advance request runs at most stepsPerAdvance() provider steps (self-host boost);
 * run state (incl. waiting_approval / waiting_client) lives in D1; the client pumps to continue.
 * Hence runs survive across requests, page reloads and browser closes; approval is runtime state.
 *
 * Security floor:
 *  - tool args always come from the server-stored tool_call row (client replays never trusted)
 *  - approvals are one-shot (only pending approvals honored)
 *  - structured events persist before forwarding (token deltas exempt: transient passthrough)
 *  - tool messages' toolCallId always equals the provider-issued call id (history consistency = API validity)
 */
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import {
	streamChatWithTools,
	resolveModelMeta,
	isRetryableProviderError,
	isContextOverflowError,
	parseRetryAfterMs,
	providerBackoffMs,
	type AgentMsg
} from '$lib/server/ai';
import { pruneToolOutputs } from './compact';
import { resolveAgent } from './agents';
import { decideToolAccess, loadRuleSets, rememberSessionAllow, type PermRule } from './permissions';
import { getSettings } from '$lib/server/settings';
import {
	anthropicToolSpecs,
	openAiToolSpecs,
	toolByName,
	validateArgs,
	visibleTools,
	type ToolCtx,
	type ToolDef
} from '../tools';
import {
	DEFAULT_RUN_LIMITS,
	maxAutoToolsPerRequest,
	stepsPerAdvance,
	budgetExceeded,
	gatedForWorkshop,
	planAutoBatch,
	toolAccess
} from './policy';
import {
	appendMessage,
	activeRunOfSession,
	buildHistory,
	completeToolCall,
	createApproval,
	appendEvent,
	doomLoopHit,
	createRun,
	recentRunCount,
	purgeOldEvents,
	createToolCall,
	decideApproval,
	hasQueuedCalls,
	listQueuedCalls,
	setToolCallStatus,
	getRun,
	getSession,
	getToolCall,
	hasPendingApprovals,
	listClientPendingCalls,
	pendingApprovalsOfRun,
	renameSession,
	requestCancelRun,
	touchSession,
	updateRun,
	type RunRow,
	type SessionRow,
	type ToolCallRow
} from './store';
import { compactSession } from './compact';
import { loadMcpToolDefs, mcpInstructions } from '$lib/agent/mcp/registry';
import { estimateTokens, budgetStatus, AUTO_COMPACT_TAIL } from './context';
import type { AgentContext, AgentEventPayloads, AgentEventType, AgentMode, Risk } from './types';

export type { AgentMode } from './types';

const TERMINALS = ['completed', 'failed', 'cancelled'];
/** 37①: tolerance for tool.completed event result previews (expandable to full) */
const RESULT_PREVIEW_CHARS = 1200;

/* ---- event channel: implemented by the API layer (persist = DB + SSE forward; delta = forward only) ---- */

export interface EventChannel {
	delta(text: string): Promise<void> | void;
	/** reasoning deltas (transient passthrough, never persisted) */
	reasoning(text: string): Promise<void> | void;
	emit<T extends AgentEventType>(
		type: T,
		payload: AgentEventPayloads[T],
		runId?: string | null
	): Promise<void> | void;
	/** dynamic events (e.g. plan.created/updated returned by the update_plan tool) */
	emitRaw(
		type: string,
		payload: Record<string, unknown>,
		runId?: string | null
	): Promise<void> | void;
}

const noopChannel: EventChannel = {
	delta: () => {},
	reasoning: () => {},
	emit: () => {},
	emitRaw: () => {}
};

/* ---- system prompt (mode × context × honesty boundaries) ---- */

/** Primary agent personas (OpenCode-isomorphic: each agent brings its own prompt persona) */
export const AGENT_PERSONAS: Record<AgentMode, string> = {
	chat: '你是「Chat」研究員：本模式只讀與研讀。深入解答問題、引用站內實數據（先查再答），不執行任何變更；使用者想改動時提醒切換 Build 或 Plan。回答可較完整地展開。',
	plan: '你是「Plan」規劃師：先大範圍調查（inspect/read/validate 工具），再以 update_plan 產出具体可執行的計畫（步驟含順序、改動面與驗證點）；一切副作用操作以提案呈現等待核准。計畫要能被 Build 直接執行。',
	agent:
		'你是「Build」執行工程師：自主完成任務——多步工作先 update_plan 立計畫，執行期間即時更新步驟狀態；工具報錯先讀錯誤修正重試（有連續失敗保護）；方向改變時 re-plan。高風險操作暫停等待核准屬正常流程。'
};

export function buildSystemPrompt(
	mode: AgentMode,
	context: AgentContext,
	instructions = '',
	mcpInstr = '',
	persona?: string
): string {
	const ctxLines: string[] = [];
	ctxLines.push(`日期：${new Date().toISOString().slice(0, 10)}`);
	if (context.route) ctxLines.push(`目前頁面 route：${context.route}`);
	if (context.locale) ctxLines.push(`介面語系：${context.locale}`);
	if (context.postSlug) ctxLines.push(`正在檢視文章：${context.postSlug}`);
	if (context.pageSlug) ctxLines.push(`正在檢視頁面：/${context.pageSlug}`);
	if (context.selectedComponent) {
		const c = context.selectedComponent;
		ctxLines.push(`Workshop 選中元件：${c.name}（${c.description ?? ''}）`);
		if (c.code) ctxLines.push(`該元件目前原始碼（含使用者未儲存草稿）：\n${c.code.slice(0, 6000)}`);
	}
	if (context.selectedText)
		ctxLines.push(`使用者選取文字：「${context.selectedText.slice(0, 500)}」`);
	if (context.emailTemplate) {
		const et = context.emailTemplate;
		ctxLines.push(
			`正在編輯郵件範本：${et.name}（slug=${et.slug}，type=${et.type}，使用中 v${et.version}${et.dirty ? '，**編輯器有未儲存草稿**，以下為草稿內容）' : ''}）`
		);
		ctxLines.push(`主旨草稿：${et.subject}`);
		ctxLines.push(`DSL 源碼草稿：\n${et.source.slice(0, 6000)}`);
		ctxLines.push(
			'修改請用 save_email_template_version（高風險會進人工審批）；版本切換用 activate_email_template_version；發送測試用 send_test_email。'
		);
	}
	if (context.themeEditing) {
		const th = context.themeEditing;
		ctxLines.push(
			`正在編輯 DB 主題：${th.label}（id=${th.id}，base=${th.base}，v${th.version}${th.dirty ? '，**工作台有未儲存草稿**，以下為草稿內容）' : ''}）`
		);
		const covered = Object.entries(th.surfaces);
		ctxLines.push(
			covered.length
				? `槽位覆蓋（${covered.length} 個）：\n${covered.map(([k, v]) => `【${k}】\n${v.code.slice(0, 3000)}`).join('\n')}`.slice(
						0,
						9000
					)
				: '槽位覆蓋：無（純 base）'
		);
		if (th.tokens.trim()) ctxLines.push(`tokens CSS 草稿：\n${th.tokens.slice(0, 2000)}`);
		if (th.behaviors && Object.values(th.behaviors).some((v) => v !== '' && v !== undefined))
			ctxLines.push(`behavior 覆蓋草稿：${JSON.stringify(th.behaviors)}`);
		ctxLines.push(
			'修改用 save_db_theme（高風險進人工審批；surfaces 為 JSON {槽位:{code,css}}，槽位限 Header/Footer/Home/Blog/Search/Post/Archive/Page/About/SeriesIndex/Series）；探看其他主題用 list_db_themes／get_db_theme；探用 set_ui_theme。DB 主題 surface 於瀏覽器編譯掛載，SSR 回落 base 版面。'
		);
	}
	const instrBlock = instructions
		? `【站長指令（SITE.md，最高優先，恆久有效）】\n${instructions}\n\n`
		: '';
	const mcpBlock = mcpInstr ? `【MCP 工具說明】\n${mcpInstr}\n\n` : '';
	return `${instrBlock}${mcpBlock}你是 Kikigaki Blog（AI-native 網站平台）的 Agentic Coding Agent，工作在站點後台。

${persona || AGENT_PERSONAS[mode]}



${
	context.selectedComponent
		? `Workshop 協作紀律（使用者正在 IDE 前盯著預覽迭代）：
- 每輪以 component_dev 提交候選碼（瀏覽器即時編譯，成功會自動套用進編輯器並重渲預覽）。
- 套用成功後就停下：簡述這輪改了什麼（≤3 行），邀請使用者看預覽並給下一步回饋。不要一口氣連做多個版本，更不要未經同意就呼叫 create_component／update_component 註冊。
- 只有使用者明確表達滿意／要保存／要註冊時，才呼叫 create_component／update_component（會請使用者按批准），之後提醒到 Registry 批准上線。
- 使用者的修改要求預設基於「目前編輯器中的原始碼」迭代，保留其已滿意的部分。

`
		: ''
}可用工具即你的全部能力。規則：
- 以使用者語言回答（預設繁體中文）；簡潔專業，重點在「做了什麼、驗證結果」。
- 涉及站內資料一律先用工具查詢；禁止編造 slug／數字／元件名。
- 寫入類工具回報 ok 才算完成；仍在審批佇列的行動不可宣稱已執行。
- 建立／修改元件一律走 registry（AI 產出自動進入待審，由人工批准後才在站上掛載）；引用前先確認可服務。
- 翻譯保留 Markdown 與 ::: 元件區塊語法、連結、圖片路徑不譯；專有名詞照原文。
- 你只操作站點資料層（文章／頁面／元件／標籤／翻譯／設定，全部經工具與服務層）。你**無法**修改原始碼倉庫、無法執行 build／測試、無法部署、無法執行裸 SQL。被要求這些時：誠實說明限制，指出需由開發者透過 opencode／Git 流程處理，並提出站內可做到的最近似替代。
${ctxLines.length ? `\n目前環境：\n${ctxLines.join('\n')}\n` : ''}`;
}

/* ---- run lifecycle ---- */

/** H1: running state without heartbeat beyond this age → reclaim as orphan run */
export const STALE_RUN_MS = 120_000;
/** 31.1: max retries for retryable provider errors (within one step) */
export const PROVIDER_RETRY_MAX = 3;

export type StartRunResult = { ok: true; runId: string } | { ok: false; error: string };

export async function startRun(
	db: D1Database,
	opts: {
		session: SessionRow;
		userId: string;
		input: string;
		context: AgentContext;
	},
	ch: EventChannel = noopChannel
): Promise<StartRunResult> {
	const active = await activeRunOfSession(db, opts.session.id);
	if (active) {
		// H1 stale reclaim: running but heartbeat too old (handler killed / provider hung) → mark failed, unlock
		if (active.status === 'running' && Date.now() - active.updatedAt > STALE_RUN_MS) {
			await updateRun(db, active.id, {
				status: 'failed',
				error: 'stale_run_recovered',
				finishedAt: new Date()
			});
			await ch.emit(
				'run.failed',
				{ error: 'stale_run_recovered（前一個 run 無回應，已自動回收）' },
				active.id
			);
		} else {
			return { ok: false, error: 'session_busy（請先完成或取消現行 run）' };
		}
	}
	// rate limit (W5): same user ≤ 20 runs per 10 minutes
	if ((await recentRunCount(db, opts.userId, 10 * 60 * 1000)) >= 20)
		return { ok: false, error: 'rate_limited（執行太頻繁，請稍後再試）' };
	// event retention cleanup (90 days): 1% sampled trigger, zero scheduling cost
	if (Math.random() < 0.01) void purgeOldEvents(db).catch(() => {});
	const agentDef = await resolveAgent(db, opts.session);
	const run = await createRun(db, {
		sessionId: opts.session.id,
		input: opts.input,
		context: JSON.stringify(opts.context ?? {}),
		limits: { ...DEFAULT_RUN_LIMITS, maxSteps: agentDef.maxSteps ?? DEFAULT_RUN_LIMITS.maxSteps }
	});
	await appendMessage(db, {
		sessionId: opts.session.id,
		runId: run.id,
		role: 'user',
		content: opts.input
	});
	if (!opts.session.title) await renameSession(db, opts.session.id, opts.input.slice(0, 60));
	await touchSession(db, opts.session.id);
	await ch.emit(
		'run.started',
		{ runId: run.id, sessionId: opts.session.id, input: opts.input, mode: opts.session.mode },
		run.id
	);
	return { ok: true, runId: run.id };
}

export interface AdvanceInput {
	/** approval decision (per approvalId; one-shot) */
	decisions?: { approvalId: string; approve: boolean; always?: boolean }[];
	/** browser-executed tool result (Workshop compile_check etc.) */
	clientResults?: { callId: string; ok: boolean; result: string }[];
}

export type AdvanceResult = { ok: true; run: RunRow } | { ok: false; error: string };

/** advance one run (digest pending items → bounded provider step loop → stop at a boundary) */
export async function advanceRun(
	db: D1Database,
	secret: string | undefined,
	opts: { runId: string; userId: string; input: AdvanceInput; ch?: EventChannel }
): Promise<AdvanceResult> {
	const ch = opts.ch ?? noopChannel;
	let run = await getRun(db, opts.runId);
	if (!run) return { ok: false, error: 'run_not_found' };
	const session = await getSession(db, run.sessionId);
	if (!session) return { ok: false, error: 'session_not_found' };
	if (TERMINALS.includes(run.status)) return { ok: true, run };

	if (run.cancelRequested) {
		await finish(db, run, 'cancelled', ch);
		return { ok: true, run: (await getRun(db, run.id)) ?? run };
	}

	// Phase 30: MCP tools applicable to this run (loaded once; shared by the approval-resume path)
	const mcpDefs = await loadMcpToolDefs(db, secret);

	// Phase 56 budget gate: 'queued' tools deferred by the previous request are digested first (≤N per request),
	// returning early if not drained (run stays 'running', client keeps pumping) — avoids per-request D1 round/CPU blowups
	const queuedNow = await listQueuedCalls(db, run.id, maxAutoToolsPerRequest());
	if (queuedNow.length > 0) {
		for (const qrow of queuedNow) {
			await setToolCallStatus(db, qrow.id, 'executed');
			await executeRow(db, run, session, qrow, ch, undefined, mcpDefs);
		}
		if (await hasQueuedCalls(db, run.id)) {
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}
		run = (await getRun(db, run.id)) ?? run;
	}

	// 1) digest approval decisions (args from the server-stored version; one-shot approval)
	if (opts.input.decisions?.length) {
		const pend = await pendingApprovalsOfRun(db, run.id);
		for (const d of opts.input.decisions) {
			const found = pend.find((x) => x.approval.id === d.approvalId);
			if (!found) continue;
			const decided = await decideApproval(
				db,
				d.approvalId,
				d.approve ? 'approved' : 'denied',
				opts.userId
			);
			if (!decided) continue;
			const call = found.call;
			await ch.emit(d.approve ? 'approval.approved' : 'approval.rejected', {
				approvalId: decided.id,
				callId: call.id
			});
			if (d.approve) {
				if (d.always) await rememberSessionAllow(db, session.id, call.name);
				await executeRow(db, run, session, call, ch, undefined, mcpDefs);
			} else {
				const payload = '{"ok":false,"error":"user_denied（使用者拒絕；請改用其他方式或說明）"}';
				await completeToolCall(db, call.id, { status: 'denied', result: payload });
				await appendMessage(db, {
					sessionId: session.id,
					runId: run.id,
					role: 'tool',
					content: payload,
					toolCallId: call.providerCallId
				});
			}
		}
		// 33.4 cascade: any rejection in the batch → reject the rest too (OpenCode reject cascade; model re-plans once)
		if (opts.input.decisions.some((x) => !x.approve)) {
			const remain = await pendingApprovalsOfRun(db, run.id);
			for (const x of remain) {
				await decideApproval(db, x.approval.id, 'denied', opts.userId);
				await completeToolCall(db, x.call.id, {
					status: 'denied',
					result: '{"ok":false,"error":"user_denied（同批次已被拒絕，此項連坐取消）"}'
				});
				await appendMessage(db, {
					sessionId: session.id,
					runId: run.id,
					role: 'tool',
					content: '{"ok":false,"error":"user_denied（同批次已被拒絕，此項連坐取消）"}',
					toolCallId: x.call.providerCallId
				});
				await ch.emit('approval.rejected', {
					approvalId: x.approval.id,
					callId: x.call.id,
					cascade: true
				});
			}
		}
		run = (await getRun(db, run.id)) ?? run;
		if (run.cancelRequested) {
			await finish(db, run, 'cancelled', ch);
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}
		if (await hasPendingApprovals(db, run.id)) return { ok: true, run };
		await updateRun(db, run.id, { status: 'running' });
		run = (await getRun(db, run.id)) ?? run;
	}

	// 2) digest browser-executed results
	if (opts.input.clientResults?.length) {
		for (const cr of opts.input.clientResults) {
			const call = await getToolCall(db, cr.callId);
			if (!call || call.runId !== run.id || call.status !== 'client_pending') continue;
			const payload = cap(JSON.stringify({ ok: cr.ok, result: cr.result.slice(0, 4000) }), 8000);
			await completeToolCall(db, call.id, {
				status: cr.ok ? 'executed' : 'failed',
				result: payload
			});
			await appendMessage(db, {
				sessionId: run.sessionId,
				runId: run.id,
				role: 'tool',
				content: payload,
				toolCallId: call.providerCallId
			});
			await ch.emit(
				'client.exec.result',
				{ callId: call.id, ok: cr.ok, resultPreview: cr.result.slice(0, RESULT_PREVIEW_CHARS) },
				run.id
			);
			if (cr.ok) {
				await ch.emit(
					'tool.completed',
					{
						callId: call.id,
						name: call.name,
						ok: true,
						resultPreview: payload.slice(0, RESULT_PREVIEW_CHARS)
					},
					run.id
				);
			} else {
				await ch.emit(
					'tool.failed',
					{ callId: call.id, name: call.name, error: payload.slice(0, 300) },
					run.id
				);
			}
		}
		run = (await getRun(db, run.id)) ?? run;
		if (run.status === 'waiting_client') {
			if ((await listClientPendingCalls(db, run.id)).length > 0) return { ok: true, run };
			await updateRun(db, run.id, { status: 'running' });
			run = (await getRun(db, run.id)) ?? run;
		}
	}

	// still waiting on human or browser → return immediately (client pump / SSE picks up later events)
	run = (await getRun(db, run.id)) ?? run;
	if (run.status === 'waiting_approval' || run.status === 'waiting_client') {
		return { ok: true, run };
	}

	// 3) provider step loop (bounded per request; unfinished work continues via client pumping)
	const context = parseContext(run.context);
	// Phase 32: effective agent definition (persona/model/effort/steps/risk cap)
	const agentDef = await resolveAgent(db, session);
	// Phase 33: permission rule chain (global → agent → session; later wins)
	const permSets = await loadRuleSets(db, { agentName: agentDef.name, sessionId: session.id });
	let nudged = false;
	let overflowTried = false;
	let stepsBumped = false;
	const stepsCap = stepsPerAdvance();
	for (let i = 0; i < stepsCap; i++) {
		const over = budgetExceeded(
			{
				stepsUsed: run.stepsUsed,
				toolCallsUsed: run.toolCallsUsed,
				totalTokens: run.inputTokens + run.outputTokens,
				wallMs: Date.now() - run.createdAt,
				consecutiveFailures: run.consecutiveFailures
			},
			{
				maxSteps: run.maxSteps,
				maxToolCalls: run.maxToolCalls,
				maxTokenBudget: run.maxTokenBudget,
				maxWallMs: DEFAULT_RUN_LIMITS.maxWallMs,
				maxConsecutiveFailures: DEFAULT_RUN_LIMITS.maxConsecutiveFailures
			}
		);
		if (over === 'step_budget_exceeded' && !stepsBumped && !run.error) {
			// 31.4: at the cap, first grant one "wrap-up summary" step (MAX_STEPS_PROMPT isomorph); fail only past that
			stepsBumped = true;
			await appendMessage(db, {
				sessionId: session.id,
				runId: run.id,
				role: 'user',
				content:
					'（系統）步驟預算已用盡。請停止呼叫工具，以使用者語言總結已完成工作、未竟事項與下一步建議。'
			});
			await updateRun(db, run.id, { maxSteps: run.maxSteps + 1, error: 'steps_bumped' });
			run = (await getRun(db, run.id)) ?? run;
			continue;
		}
		if (over) {
			await failRun(db, run, over, ch);
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}
		if (run.cancelRequested) {
			await finish(db, run, 'cancelled', ch);
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}

		// Phase 30: merge MCP dynamic tools (risk filtering same as built-ins; high/critical naturally invisible in chat)
		const mcpVisible = mcpDefs.filter((d) => toolAccess(session.mode, d.risk, false).visible);
		// 35A: exposable = decideToolAccess doesn't deny (single decision axis)
		const notDenied = (name: string, risk: string) =>
			decideToolAccess(permSets, agentDef.riskCeiling, name, risk).action !== 'deny';
		const tools = [
			...visibleTools(session.mode).filter((d) => notDenied(d.name, d.risk)),
			...mcpVisible.filter((d) => notDenied(d.name, d.risk))
		];
		if (!tools.length) {
			await failRun(db, run, 'no_tools_for_mode', ch);
			return { ok: true, run };
		}
		const workshop = !!parseContext(run.context).selectedComponent?.name;
		let history = await buildHistory(db, session.id);
		// makeup round after a nudge: double max_tokens (self-rescue when reasoning ate the budget)
		const stepMaxTokens = nudged
			? (await engineMaxTokens(db, session)) * 2
			: await engineMaxTokens(db, session);
		history = await maybeAutoCompact(db, secret, run, session, history, ch);
		history = pruneToolOutputs(history);
		const siteInstr = (await getSettings(db)).agentInstructions;
		const mcpInstr = await mcpInstructions(db);
		await ch.emit('message.started', { role: 'assistant' }, run.id);
		const callProvider = (msgs: AgentMsg[]) =>
			streamChatWithTools(db, secret, {
				modelRowId: session.modelRowId ?? agentDef.modelRowId ?? undefined,
				task: 'agent',
				effortOverride: agentDef.effort,
				system: buildSystemPrompt(session.mode, context, siteInstr, mcpInstr, agentDef.persona),
				messages: msgs,
				tools: { openai: openAiToolSpecs(tools), anthropic: anthropicToolSpecs(tools) },
				maxTokens: stepMaxTokens,
				onDelta: (t) => ch.delta(t),
				onReasoningDelta: (t) => ch.reasoning(t)
			});
		let res = await callProvider(history);
		// 31.5: overflow → compact once and retry the step
		if (!res.ok && !overflowTried && secret && isContextOverflowError(res.error)) {
			overflowTried = true;
			const cr = await compactSession(db, secret, session.id, AUTO_COMPACT_TAIL, true);
			if (cr) {
				await ch.emit(
					'context.compacted',
					{ summarized: cr.summarized, kept: cr.kept, auto: true },
					run.id
				);
				res = await callProvider(pruneToolOutputs(await buildHistory(db, session.id)));
			}
		}
		// 31.1: transient provider error → backoff retry (max 3; honors retry-after)
		for (
			let tries = 1;
			!res.ok && tries <= PROVIDER_RETRY_MAX && isRetryableProviderError(res.error);
			tries++
		) {
			const delay = parseRetryAfterMs(res.error) ?? providerBackoffMs(tries);
			await ch.emit(
				'run.retry',
				{ attempt: tries, delayMs: delay, reason: res.error.slice(0, 120) },
				run.id
			);
			await new Promise((r) => setTimeout(r, delay));
			res = await callProvider(history);
		}
		if (!res.ok) {
			await failRun(db, run, res.error, ch);
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}

		const calls = (res.calls ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			args: safeArgs(c.argsJson)
		}));
		await appendMessage(db, {
			sessionId: session.id,
			runId: run.id,
			role: 'assistant',
			content: res.text ?? '',
			...(calls.length ? { toolCalls: calls } : {}),
			...(res.reasoning ? { reasoning: res.reasoning } : {})
		});
		await ch.emit(
			'message.completed',
			{
				text: res.text ?? '',
				runId: run.id,
				...(res.reasoning ? { reasoningPreview: res.reasoning.slice(0, 2000) } : {})
			},
			run.id
		);
		await updateRun(db, run.id, {
			step: run.step + 1,
			stepsUsed: run.stepsUsed + 1,
			toolCallsUsed: run.toolCallsUsed + calls.length,
			inputTokens: run.inputTokens + (res.usage?.input ?? 0),
			outputTokens: run.outputTokens + (res.usage?.output ?? 0),
			wallMs: Date.now() - run.createdAt
		});
		run = (await getRun(db, run.id)) ?? run;

		if (calls.length === 0) {
			// thinking-exhausted self-rescue: empty final answer + long thinking → one nudge makeup round
			const noAnswer = !(res.text ?? '').trim();
			const longThink = (res.reasoning ?? '').length > 200;
			if (noAnswer && longThink && i + 1 < stepsCap && run.stepsUsed < run.maxSteps - 1) {
				await appendMessage(db, {
					sessionId: session.id,
					runId: run.id,
					role: 'user',
					content:
						'（系統自動提醒）你剛才只有思考沒有最終回覆。請直接以使用者語言給出簡潔最終答案或下一步行動，不要繼續展開思考。'
				});
				nudged = true;
				run = (await getRun(db, run.id)) ?? run;
				continue;
			}
			if (noAnswer && longThink) {
				await ch.emit(
					'message.completed',
					{ text: '', runId: run.id, reasoningPreview: (res.reasoning ?? '').slice(0, 2000) },
					run.id
				);
				await ch.emit(
					'run.failed',
					{
						error:
							'reasoning_exhausted（思考吃光輸出預算；已加倍重試仍空。請調低模型 Thinking 強度（如 high→low）、提高 max_output，或重試）'
					},
					run.id
				);
				await updateRun(db, run.id, {
					status: 'failed',
					error: 'reasoning_exhausted',
					finishedAt: new Date()
				});
				return { ok: true, run: (await getRun(db, run.id)) ?? run };
			}
			await finish(db, run, 'completed', ch);
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}

		const batch = await dispatchCalls(
			db,
			run,
			session,
			calls,
			ch,
			workshop,
			mcpDefs,
			agentDef.riskCeiling,
			permSets
		);
		if (batch === 'waiting') {
			return { ok: true, run: (await getRun(db, run.id)) ?? run };
		}
		run = (await getRun(db, run.id)) ?? run;
	}
	return { ok: true, run: (await getRun(db, run.id)) ?? run };
}

/* ---- batch dispatch (mode × risk policy take effect here) ---- */

type BatchOutcome = 'continued' | 'waiting';

async function dispatchCalls(
	db: D1Database,
	run: RunRow,
	session: SessionRow,
	calls: { id: string; name: string; args: Record<string, unknown> }[],
	ch: EventChannel,
	workshop = false,
	mcpDefs: ToolDef[] = [],
	ceiling: Risk = 'critical',
	permSets: PermRule[][] = []
): Promise<BatchOutcome> {
	let anyWaiting = false;
	let anyOk = false;
	let anyTried = false;
	const autoQueue: {
		row: ToolCallRow;
		def: ToolDef | undefined;
		c: { id: string; name: string; args: Record<string, unknown> };
	}[] = [];
	for (const c of calls) {
		const def = toolByName(c.name);
		const eff: ToolDef = def ?? (mcpDefs.find((m) => m.name === c.name) as ToolDef);
		if (!eff) {
			await syntheticToolResult(db, run, c, 'unknown_tool', ch);
			anyTried = true;
			continue;
		}
		// 31.3 doom loop: same tool + same args 3rd time in a row → don't execute; correct the model
		if (await doomLoopHit(db, session.id, c.name, c.args)) {
			await syntheticToolResult(
				db,
				run,
				c,
				'doom_loop_detected（相同工具與參數已連續執行 3 次；請停止重複，改變做法或直接給出結論）',
				ch
			);
			anyTried = true;
			continue;
		}
		// 35A: dispatch side uses the same adjudicator (privilege/rule deny → block and feed back to the model)
		const verdict = decideToolAccess(permSets, ceiling, c.name, eff.risk);
		if (verdict.action === 'deny') {
			await syntheticToolResult(db, run, c, verdict.reason ?? 'permission_denied', ch);
			anyTried = true;
			continue;
		}
		const access = toolAccess(session.mode, eff.risk, def?.special === true);
		// Workshop collaboration discipline: in the IDE context, registry registration is a "milestone" action — always user-approved
		// 35A: gating order — rule allow skips approval > rule ask forces approval > (default) risk tier + discipline
		const gated =
			verdict.action === 'allow'
				? false
				: verdict.action === 'ask'
					? true
					: access.needsApproval || gatedForWorkshop(c.name, workshop);
		if (!access.visible) {
			await syntheticToolResult(db, run, c, 'permission_denied_by_mode', ch);
			anyTried = true;
			continue;
		}
		// MCP tools skip local validation (server self-certifies schema; errors surface via call results)
		const problems = def ? validateArgs(def, c.args) : [];
		if (problems.length) {
			const row = await createToolCall(db, {
				runId: run.id,
				step: run.step,
				providerCallId: c.id,
				name: c.name,
				args: c.args,
				risk: eff.risk,
				status: 'failed',
				summary: eff.summary(c.args)
			});
			const payload = JSON.stringify({ ok: false, error: `參數無效：${problems.join('；')}` });
			await appendMessage(db, {
				sessionId: session.id,
				runId: run.id,
				role: 'tool',
				content: payload,
				toolCallId: c.id
			});
			await ch.emit(
				'tool.failed',
				{ callId: row.id, name: c.name, error: problems.join('；') },
				run.id
			);
			anyTried = true;
			continue;
		}
		if (gated) {
			const row = await createToolCall(db, {
				runId: run.id,
				step: run.step,
				providerCallId: c.id,
				name: c.name,
				args: c.args,
				risk: eff.risk,
				status: 'pending_approval',
				summary: eff.summary(c.args)
			});
			const approval = await createApproval(db, { runId: run.id, toolCallId: row.id });
			await ch.emit(
				'approval.required',
				{
					approvalId: approval.id,
					callId: row.id,
					name: c.name,
					summary: row.summary,
					risk: eff.risk,
					argsPreview: JSON.stringify(c.args).slice(0, 1500)
				},
				run.id
			);
			anyWaiting = true;
			continue;
		}
		if (def?.execution === 'client') {
			const row = await createToolCall(db, {
				runId: run.id,
				step: run.step,
				providerCallId: c.id,
				name: c.name,
				args: c.args,
				risk: eff.risk,
				status: 'client_pending',
				summary: eff.summary(c.args)
			});
			await ch.emit(
				'tool.started',
				{ callId: row.id, name: c.name, risk: eff.risk, summary: row.summary },
				run.id
			);
			await ch.emit(
				'client.exec.required',
				{ callId: row.id, runId: run.id, name: c.name, args: c.args },
				run.id
			);
			anyWaiting = true;
			continue;
		}
		const row = await createToolCall(db, {
			runId: run.id,
			step: run.step,
			providerCallId: c.id,
			name: c.name,
			args: c.args,
			risk: eff.risk,
			status: 'executed',
			summary: eff.summary(c.args)
		});
		autoQueue.push({ row, def: def ?? mcpDefs.find((m) => m.name === c.name), c });
		anyTried = true;
	}
	// Phase 56: beyond the per-request cap → 'queued' (digested first at the next advance start); the rest as usual
	const { execute, deferred } = planAutoBatch(autoQueue, maxAutoToolsPerRequest());
	for (const q of deferred) await setToolCallStatus(db, q.row.id, 'queued');
	if (deferred.length > 0) anyWaiting = true;
	// 31.2: whole batch read/low (no site side-effect conflicts) → run in parallel; any write tier → stay sequential
	if (execute.length > 1 && execute.every((q) => q.row.risk === 'read' || q.row.risk === 'low')) {
		for (const q of execute) {
			await ch.emit(
				'tool.started',
				{ callId: q.row.id, name: q.row.name, risk: q.row.risk as Risk, summary: q.row.summary },
				run.id
			);
		}
		const bodies = await Promise.all(
			execute.map((q) => runToolNow(db, run, session, q.row, q.def))
		);
		for (let k = 0; k < execute.length; k++) {
			const ok = await settleToolRow(
				db,
				run,
				session,
				execute[k].row,
				ch,
				autoQueue[k].c.id,
				bodies[k]
			);
			if (ok) anyOk = true;
		}
	} else {
		for (const q of execute) {
			const ok = await executeRow(db, run, session, q.row, ch, q.c.id, mcpDefs);
			if (ok) anyOk = true;
		}
	}

	if (anyWaiting) {
		const hasApproval = (await pendingApprovalsOfRun(db, run.id)).length > 0;
		const clientPending = (await listClientPendingCalls(db, run.id)).length > 0;
		await updateRun(db, run.id, {
			status: hasApproval ? 'waiting_approval' : clientPending ? 'waiting_client' : 'running'
		});
		return 'waiting';
	}
	await updateRun(db, run.id, {
		consecutiveFailures: anyTried && !anyOk ? run.consecutiveFailures + 1 : 0
	});
	return 'continued';
}

/** execute one tool_call row (auto or approved); msgToolCallId = provider-issued id */
async function executeRow(
	db: D1Database,
	run: RunRow,
	session: SessionRow,
	row: ToolCallRow,
	ch: EventChannel,
	msgToolCallId?: string,
	mcpDefs: ToolDef[] = []
): Promise<boolean> {
	const def = toolByName(row.name) ?? mcpDefs.find((d) => d.name === row.name);
	const providerId = msgToolCallId ?? row.providerCallId;
	await ch.emit(
		'tool.started',
		{ callId: row.id, name: row.name, risk: row.risk as Risk, summary: row.summary },
		run.id
	);
	const body = await runToolNow(db, run, session, row, def);
	return settleToolRow(db, run, session, row, ch, providerId, body);
}

/**
 * The R2 binding is injected by API endpoints before entering run/advance.
 * The Workers module-state taboo is cross-request mutable DATA; an R2 binding is static
 * Worker-wide configuration (platform.env.BUCKET is the same object per request), so storing
 * it carries no tenant cross-talk risk.
 */
let ambientBucket: R2Bucket | undefined;
let ambientMasterKey: string | undefined;
/** tool ctx.masterKey (email/AI provider credential encryption master key mirror; same pattern as setAgentBucket) */
export function setAgentMasterKey(key: string | undefined): void {
	ambientMasterKey = key;
}

export function setAgentBucket(bucket: R2Bucket | undefined): void {
	ambientBucket = bucket;
}

/** pure execution (writes no messages, emits no events); for the parallel pool */
async function runToolNow(
	db: D1Database,
	run: RunRow,
	session: SessionRow,
	row: ToolCallRow,
	def: ToolDef | undefined
): Promise<{
	ok: boolean;
	result: string;
	planEvents: { type: string; payload: Record<string, unknown> }[];
}> {
	if (!def)
		return {
			ok: false,
			result: JSON.stringify({ ok: false, error: 'unknown_tool' }),
			planEvents: []
		};
	const ctx: ToolCtx = {
		db,
		runId: run.id,
		sessionId: session.id,
		userId: session.userId,
		bucket: ambientBucket,
		masterKey: ambientMasterKey
	};
	try {
		const out = await def.run(ctx, row.args);
		const ok = out.ok !== false;
		const pe = (out as Record<string, unknown>).planEvents;
		const planEvents = Array.isArray(pe)
			? (pe as { type: string; payload: Record<string, unknown> }[])
			: [];
		return { ok, result: cap(JSON.stringify(out), 8000), planEvents };
	} catch (e) {
		return {
			ok: false,
			result: JSON.stringify({ ok: false, error: String(e instanceof Error ? e.message : e) }),
			planEvents: []
		};
	}
}

/** persist + emit events (strictly sequential; tool messages append in call order to keep provider history consistent) */
async function settleToolRow(
	db: D1Database,
	run: RunRow,
	session: SessionRow,
	row: ToolCallRow,
	ch: EventChannel,
	providerId: string,
	body: {
		ok: boolean;
		result: string;
		planEvents: { type: string; payload: Record<string, unknown> }[];
	}
): Promise<boolean> {
	const { ok, result, planEvents } = body;
	await completeToolCall(db, row.id, { status: ok ? 'executed' : 'failed', result });
	await appendMessage(db, {
		sessionId: session.id,
		runId: run.id,
		role: 'tool',
		content: result,
		toolCallId: providerId
	});
	for (const ev of planEvents) {
		await ch.emitRaw(ev.type, ev.payload, run.id);
	}
	if (ok) {
		await ch.emit(
			'tool.completed',
			{
				callId: row.id,
				name: row.name,
				ok: true,
				resultPreview: result.slice(0, RESULT_PREVIEW_CHARS)
			},
			run.id
		);
	} else {
		await ch.emit(
			'tool.failed',
			{ callId: row.id, name: row.name, error: result.slice(0, 300) },
			run.id
		);
	}
	return ok;
}

/** failures that never became tool_call rows (unknown / mode-denied) still need a tool result for history consistency */
async function syntheticToolResult(
	db: D1Database,
	run: RunRow,
	c: { id: string; name: string; args: Record<string, unknown> },
	error: string,
	ch: EventChannel
): Promise<void> {
	await appendMessage(db, {
		sessionId: run.sessionId,
		runId: run.id,
		role: 'tool',
		content: JSON.stringify({ ok: false, error }),
		toolCallId: c.id
	});
	await ch.emit('tool.failed', { callId: c.id, name: c.name, error }, run.id);
}

/* ---- teardown & ops ---- */

async function finish(
	db: D1Database,
	run: RunRow,
	status: 'completed' | 'cancelled',
	ch: EventChannel
): Promise<void> {
	await updateRun(db, run.id, { status, finishedAt: new Date() });
	if (status === 'completed') {
		await ch.emit(
			'run.completed',
			{
				steps: run.stepsUsed,
				toolCalls: run.toolCallsUsed,
				tokens: run.inputTokens + run.outputTokens,
				inputs: run.inputTokens,
				outputs: run.outputTokens
			},
			run.id
		);
	} else {
		await ch.emit('run.cancelled', {}, run.id);
	}
	await touchSession(db, run.sessionId);
}

async function failRun(
	db: D1Database,
	run: RunRow,
	error: string,
	ch: EventChannel
): Promise<void> {
	await updateRun(db, run.id, { status: 'failed', error, finishedAt: new Date() });
	await ch.emit('run.failed', { error }, run.id);
	await touchSession(db, run.sessionId);
}

export async function cancelRun(db: D1Database, runId: string): Promise<boolean> {
	const run = await getRun(db, runId);
	if (!run || TERMINALS.includes(run.status)) return false;
	// orphan running (heartbeat too old, nobody pumping): terminal state directly, else cancelRequested is never consumed
	if (run.status === 'running' && Date.now() - run.updatedAt > STALE_RUN_MS) {
		await updateRun(db, runId, {
			status: 'cancelled',
			error: 'cancelled（stale：無活耀執行流）',
			finishedAt: new Date()
		});
		await appendEvent(db, {
			sessionId: run.sessionId,
			runId,
			type: 'run.cancelled',
			payload: { stale: true }
		});
		return true;
	}
	await requestCancelRun(db, runId);
	return true;
}

/* ---- token budget & auto-compaction hooks ---- */

async function engineMeta(db: D1Database, session: SessionRow) {
	const m = await resolveModelMeta(db, {
		modelRowId: session.modelRowId ?? undefined,
		task: 'agent'
	});
	// contextWindow: null without a model (skip auto-compaction); always effective with one (user value ?? default, API-capped)
	return { contextWindow: m?.contextWindow ?? null, maxOutput: m?.maxOutputTokens ?? null };
}

async function engineMaxTokens(db: D1Database, session: SessionRow): Promise<number> {
	const meta = await engineMeta(db, session);
	return meta.maxOutput ?? 4096;
}

async function maybeAutoCompact(
	db: D1Database,
	secret: string | undefined,
	run: RunRow,
	session: SessionRow,
	history: AgentMsg[],
	ch: EventChannel
): Promise<AgentMsg[]> {
	if (!secret) return history;
	const meta = await engineMeta(db, session);
	const ctx = meta.contextWindow;
	if (!ctx) return history;
	const budget = budgetStatus(estimateTokens(history) + run.inputTokens, ctx);
	if (!budget?.shouldCompact) return history;
	const r = await compactSession(db, secret, session.id, AUTO_COMPACT_TAIL, true);
	if (!r) return history;
	await ch.emit(
		'context.compacted',
		{ summarized: r.summarized, kept: r.kept, auto: true },
		run.id
	);
	return buildHistory(db, session.id);
}

/* ---- utils ---- */

function safeArgs(json: string): Record<string, unknown> {
	try {
		const v: unknown = JSON.parse(json || '{}');
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function parseContext(raw: string): AgentContext {
	try {
		const v: unknown = JSON.parse(raw || '{}');
		return v && typeof v === 'object' ? (v as AgentContext) : {};
	} catch {
		return {};
	}
}

function cap(s: string, n: number): string {
	return s.length > n ? s.slice(0, n) + '…(截斷)' : s;
}
