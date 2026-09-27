/**
 * AI layer server core — Provider/Model D1 access, key unsealing, model refresh, task routing and chat().
 *
 * Key policy:
 * - API keys stored AES-256-GCM encrypted (key derived from AI_SECRET); pages only report "configured or not", plaintext never leaves.
 * - AI_SECRET unset → always a clear error (never silently degrade to plaintext).
 */
import type { D1Database } from '@cloudflare/workers-types';
import { and, eq } from 'drizzle-orm';
import { getDb } from './db';
import { aiModels, aiProviders } from './db/schema';
import { decryptSecret, encryptSecret, isEncrypted } from './secrets';
import {
	chatRequest,
	listModelsRequest,
	normalizeModelList,
	buildThinkingParams,
	EFFORT_BUDGET,
	REASONING_MIN_OUTPUT,
	findPresetByUrl,
	type ReasoningFamily,
	parseChatResponse,
	ToolStreamAccumulator,
	createSseLineSplitter,
	inferCapabilities,
	isSafeBaseUrl,
	DEFAULT_BASE_URL,
	type AiCapability,
	type AiTask,
	type ChatParams,
	type ProviderType,
	type ProviderInfo,
	type ModelInfo,
	type ChatOutcome
} from '$lib/ai/adapters';

export * from '$lib/ai/adapters';

function parseCaps(raw: string): AiCapability[] {
	try {
		const arr: unknown = JSON.parse(raw);
		return Array.isArray(arr) ? (arr as AiCapability[]) : [];
	} catch {
		return [];
	}
}

/* ------------------------------------------------------------------ */
/* Provider CRUD                                                       */
/* ------------------------------------------------------------------ */

export async function listProviders(db: D1Database): Promise<ProviderInfo[]> {
	const kit = getDb(db);
	const rows = await kit.select().from(aiProviders);
	return rows
		.map((r) => ({
			id: r.id,
			name: r.name,
			type: r.type as ProviderType,
			baseUrl: r.baseUrl,
			family: r.family ?? null,
			hasKey: r.apiKeyEnc !== '',
			enabled: r.enabled,
			updatedAt: r.updatedAt?.getTime?.() ?? 0
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ProviderInput {
	id?: string;
	name: string;
	type: ProviderType;
	baseUrl?: string;
	/** reasoning family: deepseek | dashscope | '' (generic) */
	family?: string;
	/** empty = keep the existing key */
	apiKey?: string;
	enabled?: boolean;
}

export async function upsertProvider(
	db: D1Database,
	secret: string | undefined,
	input: ProviderInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	if (!secret) return { ok: false, error: 'ai_secret_missing（需在環境設定 AI_SECRET）' };
	const name = input.name.trim();
	if (!name) return { ok: false, error: 'name_required' };
	if (!DEFAULT_BASE_URL[input.type] && !(input.baseUrl ?? '').trim()) {
		return { ok: false, error: 'base_url_required（openai-compatible 需自訂網址）' };
	}
	const baseUrl = (input.baseUrl ?? '').trim() || DEFAULT_BASE_URL[input.type];
	if (baseUrl && !isSafeBaseUrl(baseUrl))
		return { ok: false, error: 'base_url_unsafe（僅 https／本機）' };

	const kit = getDb(db);
	const now = new Date();

	if (input.id) {
		const existing = await kit
			.select()
			.from(aiProviders)
			.where(eq(aiProviders.id, input.id))
			.limit(1);
		if (existing.length === 0) return { ok: false, error: 'provider_not_found' };
		const patch: Record<string, unknown> = { name, type: input.type, baseUrl, updatedAt: now };
		if (input.family !== undefined) patch.family = input.family || null;
		if (input.enabled !== undefined) patch.enabled = input.enabled;
		if (input.apiKey?.trim()) patch.apiKeyEnc = await encryptSecret(secret, input.apiKey.trim());
		await kit.update(aiProviders).set(patch).where(eq(aiProviders.id, input.id));
		return { ok: true, id: input.id };
	}

	const id = crypto.randomUUID();
	try {
		await kit.insert(aiProviders).values({
			id,
			name,
			type: input.type,
			baseUrl,
			family: input.family?.trim() || null,
			apiKeyEnc: input.apiKey?.trim() ? await encryptSecret(secret, input.apiKey.trim()) : '',
			enabled: input.enabled ?? true,
			createdAt: now,
			updatedAt: now
		});
	} catch {
		return { ok: false, error: 'provider_exists（名稱重複）' };
	}
	return { ok: true, id };
}

export async function deleteProvider(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(aiProviders).where(eq(aiProviders.id, id)); // models via FK cascade
}

async function resolveProvider(kit: ReturnType<typeof getDb>, id: string) {
	const [row] = await kit.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
	return row;
}

/* ------------------------------------------------------------------ */
/* Models: refresh (GET /models) and manual management                                */
/* ------------------------------------------------------------------ */

/** model metadata (for engine token budget / compaction threshold; no key decryption needed) */
export async function resolveModelMeta(
	db: D1Database,
	opts: { modelRowId?: string; task?: AiTask }
): Promise<{
	modelId: string;
	contextWindow: number | null;
	maxOutputTokens: number | null;
	reasoningBudget: number | null;
	apiContextWindow: number | null;
} | null> {
	const kit = getDb(db);
	let row: typeof aiModels.$inferSelect | undefined;
	if (opts.modelRowId) {
		[row] = await kit.select().from(aiModels).where(eq(aiModels.id, opts.modelRowId)).limit(1);
	} else if (opts.task) {
		[row] = await kit.select().from(aiModels).where(eq(aiModels.task, opts.task)).limit(1);
		if (!row) {
			const fb = await kit
				.select({ m: aiModels })
				.from(aiModels)
				.innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
				.where(and(eq(aiModels.isDefault, true), eq(aiProviders.enabled, true)))
				.limit(1);
			row = fb[0]?.m;
		}
	} else {
		const fb = await kit
			.select({ m: aiModels })
			.from(aiModels)
			.innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
			.where(and(eq(aiModels.isDefault, true), eq(aiProviders.enabled, true)))
			.limit(1);
		row = fb[0]?.m;
	}
	if (!row) return null;
	return {
		modelId: row.modelId,
		contextWindow: effectiveContextWindow(row.contextWindow, row.apiContextWindow),
		maxOutputTokens: row.maxOutputTokens ?? null,
		reasoningBudget: row.reasoningBudget ?? null,
		apiContextWindow: row.apiContextWindow ?? null
	};
}

export async function listModels(db: D1Database): Promise<ModelInfo[]> {
	const kit = getDb(db);
	const rows = await kit
		.select({
			m: aiModels,
			pName: aiProviders.name,
			pType: aiProviders.type,
			pFamily: aiProviders.family
		})
		.from(aiModels)
		.innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id));
	return rows.map((r) => ({
		id: r.m.id,
		providerId: r.m.providerId,
		providerName: r.pName,
		providerType: r.pType as ProviderType,
		modelId: r.m.modelId,
		label: r.m.label,
		capabilities: parseCaps(r.m.capabilities),
		contextWindow: r.m.contextWindow,
		maxOutputTokens: r.m.maxOutputTokens ?? null,
		reasoningBudget: r.m.reasoningBudget ?? null,
		apiContextWindow: r.m.apiContextWindow ?? null,
		reasoningEffort: r.m.reasoningEffort ?? null,
		providerFamily: r.pFamily ?? null,
		isDefault: r.m.isDefault,
		task: r.m.task as AiTask | null
	}));
}

/** pull the model catalog from the provider and upsert (existing rows keep capabilities/routing) */
export async function refreshModels(
	db: D1Database,
	secret: string | undefined,
	providerId: string
): Promise<{ ok: true; added: number; total: number } | { ok: false; error: string }> {
	if (!secret) return { ok: false, error: 'ai_secret_missing' };
	const kit = getDb(db);
	const provider = await resolveProvider(kit, providerId);
	if (!provider) return { ok: false, error: 'provider_not_found' };
	const apiKey = await openKey(secret, provider.apiKeyEnc);
	if (!apiKey) return { ok: false, error: 'key_missing_or_undecryptable（請重設 API key）' };

	// built-in catalogs to fall back to when refresh fails (DeepSeek/Aliyun etc.)
	const preset = findPresetByUrl(
		provider.baseUrl || DEFAULT_BASE_URL[provider.type as ProviderType]
	);
	const req = listModelsRequest({
		type: provider.type as ProviderType,
		baseUrl: provider.baseUrl || DEFAULT_BASE_URL[provider.type as ProviderType],
		apiKey
	});
	let payload: unknown;
	try {
		const res = await fetch(req.url, { headers: req.headers, signal: AbortSignal.timeout(15_000) });
		if (!res.ok) return { ok: false, error: `upstream_${res.status}` };
		payload = await res.json();
	} catch (e) {
		return { ok: false, error: `network_${e instanceof Error ? e.name : 'fail'}` };
	}

	let seen = normalizeModelList(provider.type as ProviderType, payload);
	if (seen.length === 0 && preset?.models?.length)
		seen = preset.models.map((x) => ({
			modelId: x.modelId,
			label: x.label,
			contextWindow: x.contextWindow
		}));
	if (seen.length === 0)
		return { ok: false, error: 'empty_model_list（provider 格式不相容？可手動新增模型）' };

	const existing = await kit.select().from(aiModels).where(eq(aiModels.providerId, providerId));
	const byModelId = new Map(existing.map((m) => [m.modelId, m]));
	const now = new Date();
	let added = 0;
	for (const s of seen) {
		const hit = byModelId.get(s.modelId);
		if (hit) {
			// existing models: only refresh the provider ceiling (user settings untouched)
			if (s.contextWindow && s.contextWindow !== (hit.apiContextWindow ?? null)) {
				await kit
					.update(aiModels)
					.set({ apiContextWindow: s.contextWindow, updatedAt: now })
					.where(eq(aiModels.id, hit.id));
			}
			continue;
		}
		await kit.insert(aiModels).values({
			id: crypto.randomUUID(),
			providerId,
			modelId: s.modelId,
			label: s.label ?? '',
			capabilities: JSON.stringify(inferCapabilities(s.modelId)),
			contextWindow: DEFAULT_CONTEXT_WINDOW,
			apiContextWindow: s.contextWindow ?? null,
			maxOutputTokens: DEFAULT_MAX_OUTPUT,
			reasoningBudget: DEFAULT_REASONING_BUDGET,
			isDefault: existing.length === 0 && byModelId.size === 0 && added === 0, // first refresh sets the first model as default
			createdAt: now,
			updatedAt: now
		});
		added++;
	}
	return { ok: true, added, total: seen.length };
}

export async function upsertModel(
	db: D1Database,
	input: {
		id?: string;
		providerId: string;
		modelId: string;
		label?: string;
		capabilities?: AiCapability[];
		contextWindow?: number | null;
		maxOutputTokens?: number | null;
		reasoningBudget?: number | null;
		reasoningEffort?: string | null;
		isDefault?: boolean;
	}
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	const kit = getDb(db);
	if (!input.modelId.trim()) return { ok: false, error: 'model_id_required' };
	const caps = JSON.stringify(input.capabilities ?? ['text']);
	const now = new Date();

	if (input.isDefault) {
		await kit
			.update(aiModels)
			.set({ isDefault: false })
			.where(and(eq(aiModels.providerId, input.providerId), eq(aiModels.isDefault, true)));
	}

	if (input.id) {
		const patch: Record<string, unknown> = {
			label: input.label ?? '',
			capabilities: caps,
			isDefault: input.isDefault ?? false,
			updatedAt: now
		};
		// undefined = form omitted the field (don't overwrite); null = explicit clear
		if (input.contextWindow !== undefined) patch.contextWindow = input.contextWindow;
		if (input.maxOutputTokens !== undefined) patch.maxOutputTokens = input.maxOutputTokens;
		if (input.reasoningBudget !== undefined) patch.reasoningBudget = input.reasoningBudget;
		if (input.reasoningEffort !== undefined)
			patch.reasoningEffort = input.reasoningEffort === '' ? null : input.reasoningEffort;
		await kit.update(aiModels).set(patch).where(eq(aiModels.id, input.id));
		return { ok: true, id: input.id };
	}

	const id = crypto.randomUUID();
	try {
		await kit.insert(aiModels).values({
			id,
			providerId: input.providerId,
			modelId: input.modelId.trim(),
			contextWindow: input.contextWindow ?? 64_000,
			maxOutputTokens: input.maxOutputTokens ?? 8192,
			reasoningBudget: input.reasoningBudget ?? DEFAULT_REASONING_BUDGET,
			reasoningEffort: input.reasoningEffort || null,
			label: input.label?.trim() ?? '',
			capabilities: caps,
			isDefault: input.isDefault ?? false,
			createdAt: now,
			updatedAt: now
		});
	} catch {
		return { ok: false, error: 'model_exists（同 provider 重複模型 id）' };
	}
	return { ok: true, id };
}

export async function deleteModel(db: D1Database, id: string): Promise<void> {
	const kit = getDb(db);
	await kit.delete(aiModels).where(eq(aiModels.id, id));
}

/** set/clear task routing (one global modelId per task) */
export async function setTaskModel(
	db: D1Database,
	task: AiTask,
	modelId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
	const kit = getDb(db);
	if (modelId) {
		const [m] = await kit.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);
		if (!m) return { ok: false, error: 'model_not_found' };
	}
	await kit.update(aiModels).set({ task: null }).where(eq(aiModels.task, task));
	if (modelId) {
		await kit.update(aiModels).set({ task }).where(eq(aiModels.id, modelId));
	}
	return { ok: true };
}

/* ------------------------------------------------------------------ */
/* chat(): task routing → provider/model → adapter                         */
/* ------------------------------------------------------------------ */

async function openKey(secret: string, enc: string): Promise<string | null> {
	if (!enc) return null;
	if (!isEncrypted(enc)) return enc; // compatible with legacy plaintext
	return decryptSecret(secret, enc);
}

/** factory default (used whenever the user hasn't configured) */
export const DEFAULT_CONTEXT_WINDOW = 64_000;
export const DEFAULT_MAX_OUTPUT = 8192;
export const DEFAULT_REASONING_BUDGET = 8192;

/** retryable provider errors (OpenCode retry.retryable isomorph): 5xx/429/network/timeout */
export function isRetryableProviderError(err: string): boolean {
	if (isContextOverflowError(err)) return false;
	return /upstream_429|upstream_5\d\d|upstream_502|upstream_503|upstream_504|network_|provider_timeout|ECONN|socket/i.test(
		err
	);
}

/** context overflow: compact-and-retry instead of failing (overflow.ts isOverflow isomorph) */
export function isContextOverflowError(err: string): boolean {
	return /context_length|maximum context|context overflow|too many tokens|input length|status 413|upstream_413/i.test(
		err
	);
}

/** |retry-after:N (seconds) or |retry-after-ms:N embedded in the error string → ms */
export function parseRetryAfterMs(err: string): number | null {
	const ms = /retry-after-ms:(\d+)/i.exec(err);
	if (ms) return Math.min(Math.max(+ms[1], 0), 20_000);
	const sec = /retry-after:(\d+(?:\.\d+)?)/i.exec(err);
	if (sec) return Math.min(Math.max(Math.round(+sec[1] * 1000), 0), 20_000);
	return null;
}

/** exponential backoff + jitter (base 2s ×2ⁿ⁻¹, cap 10s; OpenCode delay() isomorph) */
export function providerBackoffMs(attempt: number): number {
	const base = Math.min(2000 * Math.pow(2, attempt - 1), 10_000);
	return Math.round(base * (0.8 + Math.random() * 0.4));
}

/** effective context window: user setting (or default) capped by the provider-API-reported ceiling */
export function effectiveContextWindow(
	userValue: number | null | undefined,
	apiCap: number | null | undefined
): number {
	const base = userValue && userValue > 0 ? userValue : DEFAULT_CONTEXT_WINDOW;
	return apiCap && apiCap > 0 ? Math.min(base, apiCap) : base;
}

interface ResolvedModel {
	provider: ProviderType;
	baseUrl: string;
	apiKey: string;
	modelId: string;
	providerName: string;
	maxOutput: number | null;
	reasoningBudget: number | null;
	contextWindow: number;
	family: ReasoningFamily;
	effort: string | null;
}

/** given modelRowId, or route by task (task → assigned model; else any enabled provider's isDefault) */
async function resolveModel(
	kit: ReturnType<typeof getDb>,
	secret: string,
	opts: { modelRowId?: string; task?: AiTask }
): Promise<ResolvedModel | { error: string }> {
	let row: typeof aiModels.$inferSelect | undefined;
	if (opts.modelRowId) {
		[row] = await kit.select().from(aiModels).where(eq(aiModels.id, opts.modelRowId)).limit(1);
	} else if (opts.task) {
		[row] = await kit.select().from(aiModels).where(eq(aiModels.task, opts.task)).limit(1);
		if (!row) {
			// fall back to any enabled provider's default model
			const fallback = await kit
				.select({ m: aiModels })
				.from(aiModels)
				.innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
				.where(and(eq(aiModels.isDefault, true), eq(aiProviders.enabled, true)))
				.limit(1);
			row = fallback[0]?.m;
		}
	}
	if (!row) return { error: opts.task ? `no_model_for_task（${opts.task}）` : 'model_not_found' };

	const [provider] = await kit
		.select()
		.from(aiProviders)
		.where(eq(aiProviders.id, row.providerId))
		.limit(1);
	if (!provider || !provider.enabled) return { error: 'provider_disabled' };
	const apiKey = await openKey(secret, provider.apiKeyEnc);
	if (!apiKey) return { error: 'key_missing_or_undecryptable（請在後台重設 API key）' };

	return {
		provider: provider.type as ProviderType,
		baseUrl: provider.baseUrl || DEFAULT_BASE_URL[provider.type as ProviderType],
		apiKey,
		modelId: row.modelId,
		providerName: provider.name,
		maxOutput: row.maxOutputTokens ?? null,
		reasoningBudget: row.reasoningBudget ?? null,
		contextWindow: effectiveContextWindow(row.contextWindow, row.apiContextWindow),
		family: (provider.family as ReasoningFamily) ?? null,
		effort: row.reasoningEffort ?? null
	};
}

export async function chat(
	db: D1Database,
	secret: string | undefined,
	opts: { modelRowId?: string; task?: AiTask } & Omit<ChatParams, 'model'>
): Promise<ChatOutcome> {
	if (!secret) return { ok: false, error: 'ai_secret_missing' };
	const kit = getDb(db);
	const resolved = await resolveModel(kit, secret, opts);
	if ('error' in resolved) return { ok: false, error: resolved.error };

	const req = chatRequest(
		{ type: resolved.provider, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey },
		{ ...opts, model: resolved.modelId }
	);
	try {
		const res = await fetch(req.url, {
			method: req.body ? 'POST' : 'GET',
			headers: req.headers,
			body: req.body,
			signal: AbortSignal.timeout(90_000)
		});
		if (!res.ok) {
			const text = await res.text();
			return { ok: false, error: `upstream_${res.status}（${text.slice(0, 200)}）` };
		}
		const payload: unknown = await res.json();
		const text = parseChatResponse(resolved.provider, payload);
		if (text === null) return { ok: false, error: 'unparseable_response' };
		return { ok: true, text, model: resolved.modelId, provider: resolved.providerName };
	} catch (e) {
		return { ok: false, error: `network_${e instanceof Error ? e.name : 'fail'}` };
	}
}

/** provider connectivity test (listing the model catalog counts as auth success) */
export async function testProvider(
	db: D1Database,
	secret: string | undefined,
	providerId: string
): Promise<{ ok: true; models: number } | { ok: false; error: string }> {
	const r = await refreshModels(db, secret, providerId);
	return r.ok ? { ok: true, models: r.total } : r;
}

/* ------------------------------------------------------------------ */
/* chatWithTools: function-calling edition (Phase 19 Global Agent)                  */
/* ------------------------------------------------------------------ */

export interface ToolCallRaw {
	id: string;
	name: string;
	argsJson: string;
}

export interface AgentMsg {
	role: 'user' | 'assistant' | 'tool';
	content: string;
	toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
	toolCallId?: string;
	/** assistant chain-of-thought verbatim (deepseek/dashscope multi-round tools must replay it) */
	reasoning?: string | null;
}

export type ToolsChatResult =
	| {
			ok: true;
			text: string | null;
			calls: ToolCallRaw[];
			reasoning?: string | null;
			usage?: { input: number; output: number };
	  }
	| { ok: false; error: string };

export interface ToolsChatOptions {
	modelRowId?: string;
	task?: AiTask;
	/** agent-definition thinking-effort override (takes precedence over the model's effort column) */
	effortOverride?: string | null;
	system: string;
	messages: AgentMsg[];
	tools: { openai: unknown[]; anthropic: unknown[] };
	maxTokens?: number;
}

/** build the tool-calling request per provider type and parse the response (google unsupported for now) */
type ToolsReq = { url: string; headers: Record<string, string>; body: string };

/** resolve the model and build the tool-calling request (stream variant sets the stream flag) */
async function toolsRequest(
	db: D1Database,
	secret: string | undefined,
	opts: ToolsChatOptions,
	stream: boolean | 'no-usage'
): Promise<
	| { ok: true; req: ToolsReq; provider: ProviderType; hasThinking: boolean }
	| { ok: false; error: string }
> {
	if (!secret) return { ok: false, error: 'ai_secret_missing' };
	const kit = getDb(db);
	const resolved = await resolveModel(kit, secret, {
		modelRowId: opts.modelRowId,
		task: opts.task
	});
	if ('error' in resolved) return { ok: false, error: resolved.error };
	const { provider, baseUrl, apiKey, modelId, contextWindow, family } = resolved;
	const effort = opts.effortOverride ?? resolved.effort;
	const maxOutput = resolved.maxOutput ?? DEFAULT_MAX_OUTPUT;
	const reasoningBudget = resolved.reasoningBudget ?? DEFAULT_REASONING_BUDGET;
	const thinkOff = effort === 'off';
	// Anthropic multi-round tools requires replaying signed thinking blocks (unsupported yet) → disable thinking when history has tool calls to avoid 400
	const hasPriorToolCalls = opts.messages.some(
		(m) => m.role === 'assistant' && !!m.toolCalls?.length
	);

	let req: ToolsReq;
	let hasThinking = false;
	if (provider === 'anthropic') {
		// thinking-block replay unimplemented (needs signatures) → disable thinking when history has tool calls to avoid 400
		const anthropicOn = !thinkOff && !hasPriorToolCalls;
		const eff = effort && effort !== 'off' ? effort : 'high';
		const budget = thinkOff
			? 0
			: effort
				? (EFFORT_BUDGET[eff] ?? reasoningBudget)
				: reasoningBudget;
		let outTok = Math.max(opts.maxTokens ?? maxOutput, budget + 1024);
		if (!thinkOff) outTok = Math.max(outTok, REASONING_MIN_OUTPUT);
		outTok = Math.max(1024, Math.min(outTok, contextWindow - 1024));
		const rb = Math.min(budget, outTok - 1024);
		hasThinking = anthropicOn && rb >= 1024;
		req = {
			url: `${baseUrl}/messages`,
			headers: {
				'content-type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': hasThinking ? '2024-10-22' : '2023-06-01'
			},
			body: JSON.stringify({
				model: modelId,
				max_tokens: outTok,
				system: opts.system,
				tools: opts.tools.anthropic,
				messages: toAnthropicMessages(opts.messages),
				...(stream ? { stream: true } : {}),
				...(hasThinking ? { thinking: { type: 'enabled', budget_tokens: rb } } : {})
			})
		};
	} else if (provider === 'openai' || provider === 'openai-compatible') {
		const isCompat = provider === 'openai-compatible';
		const oSeries = provider === 'openai' && /^o[1345]|gpt-5/i.test(modelId);
		const thinkOn = isCompat || oSeries ? !thinkOff : false;
		let outTok = opts.maxTokens ?? maxOutput;
		if (thinkOn) outTok = Math.max(outTok, REASONING_MIN_OUTPUT);
		outTok = Math.max(1024, Math.min(outTok, contextWindow - 1024));
		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: outTok,
			tools: opts.tools.openai,
			// DeepSeek/DashScope: assistant reasoning_content must be replayed (a 400-level requirement with tools)
			messages: toOpenAiMessages(
				opts.system,
				opts.messages,
				isCompat && (family === 'deepseek' || family === 'dashscope')
			)
		};
		if (stream) {
			body.stream = true;
			if (stream === true) body.stream_options = { include_usage: true };
		}
		if (isCompat && thinkOn) {
			const tp = buildThinkingParams(family, effort, resolved.reasoningBudget, true);
			Object.assign(body, tp.fields);
			hasThinking = tp.thinkingOn;
		} else if (isCompat && thinkOff) {
			const tp = buildThinkingParams(family, 'off', null, false);
			Object.assign(body, tp.fields);
		} else if (oSeries && !thinkOff) {
			body.reasoning_effort = effort === 'max' ? 'high' : (effort ?? 'medium');
			hasThinking = true;
		} else if (oSeries && thinkOff) {
			body.reasoning_effort = 'minimal';
		}
		req = {
			url: `${baseUrl}/chat/completions`,
			headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
			body: JSON.stringify(body)
		};
	} else {
		return {
			ok: false,
			error: 'provider_tools_unsupported（目前 Agent 支援 openai／openai-compatible／anthropic）'
		};
	}
	return { ok: true, req, provider: provider as ProviderType, hasThinking };
}

export async function chatWithTools(
	db: D1Database,
	secret: string | undefined,
	opts: ToolsChatOptions
): Promise<ToolsChatResult> {
	const built = await toolsRequest(db, secret, opts, false);
	if (!built.ok) return { ok: false, error: built.error };
	const { req, provider } = built;

	try {
		const res = await fetch(req.url, {
			method: 'POST',
			headers: req.headers,
			body: req.body,
			signal: AbortSignal.timeout(120_000)
		});
		if (!res.ok) {
			const t = await res.text();
			return { ok: false, error: `upstream_${res.status}（${t.slice(0, 200)}）` };
		}
		const payload: unknown = await res.json();
		if (provider === 'anthropic') return parseAnthropicToolResponse(payload);
		return parseOpenAiToolResponse(payload);
	} catch (e) {
		return { ok: false, error: `network_${e instanceof Error ? e.name : 'fail'}` };
	}
}

/** H3: max gap between stream chunks (beyond this the provider counts as hung) */
export const STREAM_CHUNK_IDLE_MS = 60_000;

export interface StreamToolsChatOptions extends ToolsChatOptions {
	/** text delta callback (SSE passthrough; never persisted) */
	onDelta?: (text: string) => void | Promise<void>;
	/** reasoning delta callback (thinking models; transient passthrough) */
	onReasoningDelta?: (text: string) => void | Promise<void>;
	signal?: AbortSignal;
}

/** streaming function-calling: live deltas, normalized to ToolsChatResult at the end */
export async function streamChatWithTools(
	db: D1Database,
	secret: string | undefined,
	opts: StreamToolsChatOptions
): Promise<ToolsChatResult> {
	const run = async (
		req: ToolsReq,
		provider: ProviderType
	): Promise<{ status: number; result?: ToolsChatResult; error?: string }> => {
		try {
			const res = await fetch(req.url, {
				method: 'POST',
				headers: { ...req.headers, accept: 'text/event-stream' },
				body: req.body,
				signal: opts.signal ?? AbortSignal.timeout(120_000)
			});
			if (!res.ok || !res.body) {
				const t = await res.text().catch(() => '');
				const raMs = res.headers.get('retry-after-ms');
				const ra = res.headers.get('retry-after');
				const raTag = raMs ? `|retry-after-ms:${raMs}` : ra ? `|retry-after:${ra}` : '';
				return {
					status: res.status,
					error: `upstream_${res.status}（${t.slice(0, 200)}）${raTag}`
				};
			}
			const acc = new ToolStreamAccumulator(provider);
			const split = createSseLineSplitter();
			const dec = new TextDecoder();
			const reader = res.body.getReader();
			for (;;) {
				// H3 watchdog: 60s without any chunk = hung
				const raced = await Promise.race([
					reader.read(),
					new Promise<'stall'>((r) => setTimeout(() => r('stall'), STREAM_CHUNK_IDLE_MS))
				]);
				if (raced === 'stall') {
					try {
						reader.cancel();
					} catch {
						/* noop */
					}
					return {
						status: 0,
						error: `provider_timeout（${STREAM_CHUNK_IDLE_MS / 1000}s 無串流資料）`
					};
				}
				const { done, value } = raced;
				if (done) break;
				for (const data of split(dec.decode(value, { stream: true }))) {
					const delta = acc.feed(data);
					if (delta && opts.onDelta) await opts.onDelta(delta);
					if (acc.reasoningDelta) {
						const rd = acc.reasoningDelta;
						acc.reasoningDelta = '';
						if (opts.onReasoningDelta) await opts.onReasoningDelta(rd);
					}
				}
			}
			for (const data of split('', true)) {
				const delta = acc.feed(data);
				if (delta && opts.onDelta) await opts.onDelta(delta);
			}
			return {
				status: 200,
				result: {
					ok: true,
					text: acc.text() || null,
					calls: acc.calls().map((c) => ({ id: c.id, name: c.name, argsJson: c.argsJson })),
					reasoning: acc.reasoning() || null,
					usage: { input: acc.usage.input, output: acc.usage.output }
				}
			};
		} catch (e) {
			const name = e instanceof Error ? e.name : 'fail';
			return {
				status: 0,
				error: name === 'TimeoutError' ? 'provider_timeout（請求總時數逾 120s）' : `network_${name}`
			};
		}
	};

	const built = await toolsRequest(db, secret, opts, true);
	if (!built.ok) return { ok: false, error: built.error };
	let last = await run(built.req, built.provider);
	if (last.result) return last.result;
	// compatibility degrade chain: drop thinking → then drop stream_options (some vendors reject it; retry per 4xx)
	// overflow-400 is content oversize, not param incompatibility → don't degrade; return to the engine for the compact-retry path
	if (last.status >= 400 && last.status < 500 && !isContextOverflowError(last.error ?? '')) {
		if (built.hasThinking) {
			const stripped = built.req.body
				.replace(/,"thinking":\{[^}]*\}/, '')
				.replace(/,"reasoning_content":("[^"]*")/g, '');
			last = await run({ ...built.req, body: stripped }, built.provider);
			if (last.result) return last.result;
		}
		if (built.provider === 'openai' || built.provider === 'openai-compatible') {
			const stripped = built.req.body
				.replace(/,"thinking":\{[^}]*\}/, '')
				.replace(/,"stream_options":\{[^}]*\}/, '')
				.replace(/,"enable_thinking":(true|false)/, '')
				.replace(/,"thinking_budget":\d+/, '')
				.replace(/,"reasoning_effort":"[^"]*"/, '');
			last = await run({ ...built.req, body: stripped }, built.provider);
			if (last.result) return last.result;
		}
	}
	return { ok: false, error: last.error ?? 'stream_failed' };
}

function toOpenAiMessages(
	system: string,
	messages: AgentMsg[],
	includeReasoning = false
): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [{ role: 'system', content: system }];
	for (const m of messages) {
		if (m.role === 'tool') {
			out.push({ role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content });
		} else if (m.role === 'assistant') {
			const msg: Record<string, unknown> = {
				role: 'assistant',
				content: m.content || (m.toolCalls?.length ? null : m.content)
			};
			if (m.toolCalls?.length) {
				msg.tool_calls = m.toolCalls.map((c) => ({
					id: c.id,
					type: 'function',
					function: { name: c.name, arguments: JSON.stringify(c.args) }
				}));
			}
			// DeepSeek/DashScope: requests with tools must replay every round's reasoning_content, else 400
			if (includeReasoning && m.reasoning) msg.reasoning_content = m.reasoning;
			out.push(msg);
		} else {
			out.push({ role: m.role, content: m.content });
		}
	}
	return out;
}

function toAnthropicMessages(messages: AgentMsg[]): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	for (const m of messages) {
		if (m.role === 'user') {
			out.push({ role: 'user', content: m.content });
		} else if (m.role === 'assistant') {
			const blocks: unknown[] = [];
			if (m.content) blocks.push({ type: 'text', text: m.content });
			for (const c of m.toolCalls ?? []) {
				blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
			}
			if (blocks.length) out.push({ role: 'assistant', content: blocks });
		} else if (m.role === 'tool') {
			const block = { type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content };
			const prev = out[out.length - 1];
			// consecutive tool_results must merge into one user message
			if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
				(prev.content as unknown[]).push(block);
			} else {
				out.push({ role: 'user', content: [block] });
			}
		}
	}
	return out;
}

function parseOpenAiToolResponse(payload: unknown): ToolsChatResult {
	const o = (payload ?? {}) as Record<string, unknown>;
	const choices = Array.isArray(o.choices) ? o.choices : [];
	const msg = (choices[0] as Record<string, unknown> | undefined)?.message as
		Record<string, unknown> | undefined;
	if (!msg) return { ok: false, error: 'unparseable_response' };
	const rawCalls = Array.isArray(msg.tool_calls) ? (msg.tool_calls as unknown[]) : [];
	const calls: ToolCallRaw[] = rawCalls.map((c, i) => {
		const cc = c as Record<string, unknown>;
		const fn = (cc.function ?? {}) as Record<string, unknown>;
		return {
			id: String(cc.id ?? `call_${i}`),
			name: String(fn.name ?? ''),
			argsJson: String(fn.arguments ?? '{}')
		};
	});
	return { ok: true, text: typeof msg.content === 'string' ? msg.content : null, calls };
}

function parseAnthropicToolResponse(payload: unknown): ToolsChatResult {
	const o = (payload ?? {}) as Record<string, unknown>;
	const content = Array.isArray(o.content) ? (o.content as unknown[]) : null;
	if (!content) return { ok: false, error: 'unparseable_response' };
	const texts: string[] = [];
	const calls: ToolCallRaw[] = [];
	for (const [i, b] of content.entries()) {
		const bb = b as Record<string, unknown>;
		if (bb.type === 'text') texts.push(String(bb.text ?? ''));
		else if (bb.type === 'tool_use') {
			calls.push({
				id: String(bb.id ?? `tu_${i}`),
				name: String(bb.name ?? ''),
				argsJson: JSON.stringify(bb.input ?? {})
			});
		}
	}
	return { ok: true, text: texts.join('') || null, calls };
}
