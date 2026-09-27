/**
 * AI Provider Adapters (pure logic; no DB / no secret access) —
 * request construction / response normalization / capability inference. Transport injected by callers (fetch).
 *
 * Supports: openai / openai-compatible (/chat/completions + Bearer),
 * anthropic (/messages + x-api-key), google (generateContent + ?key=).
 */

export type ProviderType = 'openai' | 'anthropic' | 'google' | 'openai-compatible';

/** Reasoning family (parameter dialect on top of openai-compatible; determines thinking-control format) */
export type ReasoningFamily = 'deepseek' | 'dashscope' | null;
export const REASONING_FAMILIES: (ReasoningFamily | 'generic')[] = [
	'generic',
	'deepseek',
	'dashscope'
];

/** effort → token budget table (budget-style providers: anthropic budget_tokens / dashscope thinking_budget) */
export const EFFORT_BUDGET: Record<string, number> = {
	low: 2048,
	medium: 8192,
	high: 16384,
	max: 32768
};

/** Output floor when thinking is on (reasoning and content share max_tokens; too small → reasoning_exhausted) */
export const REASONING_MIN_OUTPUT = 16384;

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'max';
export const REASONING_EFFORTS: ReasoningEffort[] = ['off', 'low', 'medium', 'high', 'max'];

export function isReasoningEffort(v: unknown): v is ReasoningEffort {
	return typeof v === 'string' && (REASONING_EFFORTS as string[]).includes(v);
}

/**
 * Build thinking-control fields per family (isomorphic to OpenCode ProviderTransform.variants).
 * deepseek: thinking{type}+reasoning_effort (official map low→low/medium→high/high→high/max→max, passed through)
 * dashscope: enable_thinking+thinking_budget
 * Returns the fragment to splice into the request body + whether thinking is actually on.
 */
export function buildThinkingParams(
	family: ReasoningFamily,
	effort: string | null,
	budget: number | null,
	enabled: boolean
): { fields: Record<string, unknown>; thinkingOn: boolean } {
	if (!enabled)
		return {
			fields: { ...(family === 'deepseek' ? { thinking: { type: 'disabled' } } : {}) },
			thinkingOn: false
		};
	const eff = effort && effort !== 'off' ? effort : 'high';
	if (family === 'deepseek') {
		return {
			fields: { thinking: { type: 'enabled' }, reasoning_effort: eff },
			thinkingOn: true
		};
	}
	// dashscope and generic openai-compatible: token-budget style
	const b = budget && budget > 0 ? budget : (EFFORT_BUDGET[eff] ?? 8192);
	return {
		fields: { enable_thinking: true, thinking_budget: b },
		thinkingOn: true
	};
}

/** Isomorphic to OpenCode models.dev: built-in provider catalog (offline fallback + form prefill) */
export interface ProviderPreset {
	id: string;
	label: string;
	type: ProviderType;
	baseUrl: string;
	family: ReasoningFamily;
	models?: { modelId: string; label: string; contextWindow: number; maxOutput: number }[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
	{
		id: 'deepseek',
		label: 'DeepSeek',
		type: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com',
		family: 'deepseek',
		models: [
			{
				modelId: 'deepseek-v4-pro',
				label: 'DeepSeek V4 Pro',
				contextWindow: 1_000_000,
				maxOutput: 65_536
			},
			{
				modelId: 'deepseek-v4-flash',
				label: 'DeepSeek V4 Flash',
				contextWindow: 1_000_000,
				maxOutput: 65_536
			},
			{
				modelId: 'deepseek-v4-flash-vision-exp',
				label: 'DeepSeek V4 Flash Vision',
				contextWindow: 1_000_000,
				maxOutput: 65_536
			}
		]
	},
	{
		id: 'aliyun',
		label: '阿里雲百煉（DashScope）',
		type: 'openai-compatible',
		baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
		family: 'dashscope',
		models: [
			{ modelId: 'qwen3.7-max', label: 'Qwen3.7 Max', contextWindow: 1_000_000, maxOutput: 65_536 },
			{ modelId: 'qwen3-max', label: 'Qwen3 Max', contextWindow: 262_144, maxOutput: 65_536 },
			{ modelId: 'qwen-plus', label: 'Qwen Plus', contextWindow: 1_000_000, maxOutput: 32_768 },
			{ modelId: 'qwen-turbo', label: 'Qwen Turbo', contextWindow: 1_000_000, maxOutput: 16_384 }
		]
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		type: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		family: null
	},
	{ id: 'openai', label: 'OpenAI', type: 'openai', baseUrl: '', family: null },
	{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', baseUrl: '', family: null },
	{ id: 'google', label: 'Google', type: 'google', baseUrl: '', family: null },
	{
		id: 'custom',
		label: '自訂（openai-compatible）',
		type: 'openai-compatible',
		baseUrl: '',
		family: null
	}
];

export function findPreset(id: string): ProviderPreset | undefined {
	return PROVIDER_PRESETS.find((p) => p.id === id);
}

/** Match the right built-in catalog by base URL (fallback when refresh fails) */
export function findPresetByUrl(url: string): ProviderPreset | undefined {
	const origin = (() => {
		try {
			return new URL(url).origin;
		} catch {
			return '';
		}
	})();
	if (!origin) return undefined;
	return PROVIDER_PRESETS.find((p) => p.baseUrl && new URL(p.baseUrl).origin === origin);
}

export const PROVIDER_TYPES: ProviderType[] = [
	'openai',
	'anthropic',
	'google',
	'openai-compatible'
];

export const CAPABILITIES = ['text', 'vision', 'tools', 'structured', 'code'] as const;
export type AiCapability = (typeof CAPABILITIES)[number];

export const TASKS = ['translation', 'summarization', 'seo', 'component', 'agent'] as const;
export type AiTask = (typeof TASKS)[number];

export function isProviderType(v: string): v is ProviderType {
	return (PROVIDER_TYPES as readonly string[]).includes(v);
}

export function isAiTask(v: string): v is AiTask {
	return (TASKS as readonly string[]).includes(v);
}

export const DEFAULT_BASE_URL: Record<ProviderType, string> = {
	openai: 'https://api.openai.com/v1',
	anthropic: 'https://api.anthropic.com/v1',
	google: 'https://generativelanguage.googleapis.com/v1beta',
	'openai-compatible': ''
};

export interface ResolvedProvider {
	type: ProviderType;
	/** Effective root URL (callers resolve DEFAULT_BASE_URL first) */
	baseUrl: string;
	apiKey: string;
}

export interface ChatParams {
	model: string;
	messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
	maxTokens?: number;
	temperature?: number;
}

export interface BuiltRequest {
	url: string;
	headers: Record<string, string>;
	body?: string;
}

/** base URL safety: https only; local dev allows http://localhost|127.0.0.1 */
export function isSafeBaseUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (u.protocol === 'https:') return true;
		return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
	} catch {
		return false;
	}
}

/** Model catalog listing request */
export function listModelsRequest(p: ResolvedProvider): BuiltRequest {
	switch (p.type) {
		case 'anthropic':
			return {
				url: `${p.baseUrl}/models`,
				headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
			};
		case 'google':
			return { url: `${p.baseUrl}/models?key=${encodeURIComponent(p.apiKey)}`, headers: {} };
		default:
			return {
				url: `${p.baseUrl}/models`,
				headers: { Authorization: `Bearer ${p.apiKey}` }
			};
	}
}

/** Normalize list responses to {modelId,label}[] (all three vendor shapes at once) */
export function normalizeModelList(
	type: ProviderType,
	payload: unknown
): { modelId: string; label?: string; contextWindow?: number | null }[] {
	const o = (payload ?? {}) as Record<string, unknown>;
	if (type === 'google' && Array.isArray(o.models)) {
		return (o.models as unknown[])
			.map((m) => {
				const mm = m as Record<string, unknown>;
				const name = String(mm.name ?? '');
				return { modelId: name.replace(/^models\//, ''), label: String(mm.displayName ?? name) };
			})
			.filter((r) => r.modelId);
	}
	let raw: unknown[] = [];
	if (Array.isArray(o.data)) raw = o.data;
	else if (Array.isArray(o.models)) raw = o.models;
	return raw
		.map((m) => {
			if (typeof m === 'string') return { modelId: m };
			const mm = m as Record<string, unknown>;
			const id = String(mm.id ?? mm.name ?? mm.modelId ?? '');
			const label = mm.display_name ?? mm.displayName ?? mm.label;
			const cwRaw = mm.context_length ?? mm.context_window ?? mm.max_context_tokens;
			const cw = typeof cwRaw === 'number' && cwRaw > 1000 ? cwRaw : null;
			return { modelId: id, ...(label ? { label: String(label) } : {}), contextWindow: cw };
		})
		.filter((r) => r.modelId);
}

/** Chat request */
export function chatRequest(p: ResolvedProvider, params: ChatParams): BuiltRequest {
	const maxTokens = params.maxTokens ?? 2048;
	switch (p.type) {
		case 'anthropic': {
			const system = params.messages
				.filter((m) => m.role === 'system')
				.map((m) => m.content)
				.join('\n');
			const messages = params.messages
				.filter((m) => m.role !== 'system')
				.map((m) => ({ role: m.role, content: m.content }));
			return {
				url: `${p.baseUrl}/messages`,
				headers: {
					'content-type': 'application/json',
					'x-api-key': p.apiKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: params.model,
					max_tokens: maxTokens,
					...(system ? { system } : {}),
					messages,
					...(params.temperature !== undefined ? { temperature: params.temperature } : {})
				})
			};
		}
		case 'google': {
			const system = params.messages
				.filter((m) => m.role === 'system')
				.map((m) => m.content)
				.join('\n');
			const contents = params.messages
				.filter((m) => m.role !== 'system')
				.map((m) => ({
					role: m.role === 'assistant' ? 'model' : 'user',
					parts: [{ text: m.content }]
				}));
			return {
				url: `${p.baseUrl}/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(p.apiKey)}`,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents,
					...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
					generationConfig: {
						maxOutputTokens: maxTokens,
						...(params.temperature !== undefined ? { temperature: params.temperature } : {})
					}
				})
			};
		}
		default:
			return {
				url: `${p.baseUrl}/chat/completions`,
				headers: { 'content-type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
				body: JSON.stringify({
					model: params.model,
					messages: params.messages,
					max_tokens: maxTokens,
					...(params.temperature !== undefined ? { temperature: params.temperature } : {})
				})
			};
	}
}

/** Normalize chat responses to plain text; null when unparseable (callers degrade to an error) */
export function parseChatResponse(type: ProviderType, payload: unknown): string | null {
	const o = (payload ?? {}) as Record<string, unknown>;
	if (type === 'anthropic') {
		const content = o.content;
		if (Array.isArray(content)) {
			return content
				.map((c) => {
					const cc = c as Record<string, unknown>;
					return cc.type === 'text' ? String(cc.text ?? '') : '';
				})
				.join('');
		}
		return null;
	}
	if (type === 'google') {
		const candidates = o.candidates;
		if (Array.isArray(candidates) && candidates.length > 0) {
			const parts = (candidates[0] as Record<string, unknown>)?.content;
			const partArr = (parts as Record<string, unknown>)?.parts;
			if (Array.isArray(partArr)) {
				return partArr.map((x) => String((x as Record<string, unknown>).text ?? '')).join('');
			}
		}
		return null;
	}
	const choices = o.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const msg = (choices[0] as Record<string, unknown>)?.message as
			Record<string, unknown> | undefined;
		if (typeof msg?.content === 'string') return msg.content;
	}
	return null;
}

/**
 * Capability inference (heuristic; defaults on model refresh, admin-overridable).
 */
export function inferCapabilities(modelId: string): AiCapability[] {
	const id = modelId.toLowerCase();
	const caps = new Set<AiCapability>(['text']);
	if (/vision|-vl|multimodal|glm-4v|kimi.*vis|qwen.*vis/.test(id)) caps.add('vision');
	if (/gpt-4o|gpt-4\.1|gpt-5|o[134]|claude|gemini-2|deepseek-v3|qwen|llama-3|mistral/.test(id)) {
		caps.add('tools');
	}
	if (/gpt|claude|gemini|deepseek|qwen|llama-3|mistral|grok/.test(id)) caps.add('structured');
	if (/code|coder|o[14]|gpt-5|claude|gemini-2[.-].*flash/.test(id)) caps.add('code');
	return [...caps];
}

/** Model id sorting (new→old is manual; here just a stable alphabetical order) */
export function sortModelIds(
	list: { modelId: string; label?: string }[]
): { modelId: string; label?: string }[] {
	return [...list].sort((a, b) => a.modelId.localeCompare(b.modelId));
}

/* ---- shared row types (server access layer + admin UI; pure data, no secrets) ---- */

export interface ProviderInfo {
	id: string;
	name: string;
	type: ProviderType;
	baseUrl: string;
	/** Reasoning family (deepseek/dashscope/null generic) */
	family: string | null;
	hasKey: boolean;
	enabled: boolean;
	updatedAt: number;
}

export interface ModelInfo {
	id: string;
	providerId: string;
	providerName: string;
	providerType: ProviderType;
	modelId: string;
	label: string;
	capabilities: AiCapability[];
	contextWindow: number | null;
	maxOutputTokens: number | null;
	reasoningBudget: number | null;
	apiContextWindow?: number | null;
	reasoningEffort: string | null;
	providerFamily?: string | null;
	isDefault: boolean;
	task: AiTask | null;
}

export interface ChatOutcome {
	ok: boolean;
	text?: string;
	error?: string;
	model?: string;
	provider?: string;
}

/* ---- streaming tool-response delta parsing (Phase 23) ----------------------------- */
/* SSE lines arrive as "data: {...}"; the parser only takes JSON strings, accumulating text and
   fragmented tool_calls (openai splits by index; anthropic by content block). */

export interface StreamToolCall {
	id: string;
	name: string;
	argsJson: string;
}

export interface StreamUsage {
	input: number;
	output: number;
}

export class ToolStreamAccumulator {
	private textBuf = '';
	private reasoningBuf = '';
	/** Un-forwarded reasoning deltas (drained on each read-loop pass) */
	reasoningDelta = '';
	private callBuf: { id: string; name: string; args: string }[] = [];
	private finishReason = '';
	usage: StreamUsage = { input: 0, output: 0 };

	constructor(readonly type: ProviderType) {}

	/** Feed one SSE data payload ("data:" prefix already stripped); returns forwardable text deltas */
	feed(raw: string): string {
		let o: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== 'object') return '';
			o = parsed as Record<string, unknown>;
		} catch {
			return '';
		}
		if (this.type === 'anthropic') return this.feedAnthropic(o);
		return this.feedOpenAi(o);
	}

	private feedOpenAi(o: Record<string, unknown>): string {
		const usage = o.usage as Record<string, unknown> | undefined;
		if (usage) {
			this.usage.input = Number(usage.prompt_tokens ?? this.usage.input);
			this.usage.output = Number(usage.completion_tokens ?? this.usage.output);
		}
		const choices = Array.isArray(o.choices) ? o.choices : [];
		if (!choices.length) return '';
		const choice = choices[0] as Record<string, unknown>;
		if (typeof choice.finish_reason === 'string') this.finishReason = choice.finish_reason;
		const delta = (choice.delta ?? {}) as Record<string, unknown>;
		let out = '';
		if (typeof delta.content === 'string' && delta.content) {
			this.textBuf += delta.content;
			out = delta.content;
		}
		// openai-compatible reasoning conventions (DeepSeek-R1 / Kimi think / Qwen etc.)
		for (const key of ['reasoning_content', 'reasoning']) {
			const rv = delta[key];
			if (typeof rv === 'string' && rv) {
				this.reasoningBuf += rv;
				this.reasoningDelta += rv;
			}
		}
		const tcs = Array.isArray(delta.tool_calls) ? (delta.tool_calls as unknown[]) : [];
		for (const t of tcs) {
			const tc = t as Record<string, unknown>;
			const idx = Number(tc.index ?? 0);
			while (this.callBuf.length <= idx) this.callBuf.push({ id: '', name: '', args: '' });
			const slot = this.callBuf[idx];
			if (typeof tc.id === 'string' && tc.id) slot.id = tc.id;
			const fn = tc.function as Record<string, unknown> | undefined;
			if (fn) {
				if (typeof fn.name === 'string') slot.name += fn.name;
				if (typeof fn.arguments === 'string') slot.args += fn.arguments;
			}
		}
		return out;
	}

	private feedAnthropic(o: Record<string, unknown>): string {
		const ev = String(o.type ?? '');
		if (ev === 'message_start') {
			const usage = (o.message as Record<string, unknown> | undefined)?.usage as
				Record<string, unknown> | undefined;
			if (usage) this.usage.input = Number(usage.input_tokens ?? 0);
			return '';
		}
		if (ev === 'content_block_start') {
			const block = o.content_block as Record<string, unknown>;
			if (block?.type === 'thinking' || block?.type === 'redacted_thinking') {
				// thinking block body has no initial text; deltas accumulate separately
			}
			if (block?.type === 'tool_use') {
				this.callBuf.push({
					id: String(block.id ?? ''),
					name: String(block.name ?? ''),
					args: ''
				});
			}
			return '';
		}
		if (ev === 'content_block_delta') {
			const d = (o.delta ?? {}) as Record<string, unknown>;
			if (d.type === 'text_delta' && typeof d.text === 'string') {
				this.textBuf += d.text;
				return d.text;
			}
			if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
				const slot = this.callBuf[this.callBuf.length - 1];
				if (slot) slot.args += d.partial_json;
			}
			if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
				this.reasoningBuf += d.thinking;
				this.reasoningDelta += d.thinking;
			}
			// signature_delta / redacted_thinking: swallow (no crash, no display)
			return '';
		}
		if (ev === 'message_delta') {
			const delta = (o.delta ?? {}) as Record<string, unknown>;
			if (typeof delta.stop_reason === 'string') this.finishReason = delta.stop_reason;
			const usage = o.usage as Record<string, unknown> | undefined;
			if (usage) this.usage.output = Number(usage.output_tokens ?? this.usage.output);
			return '';
		}
		return '';
	}

	text(): string {
		return this.textBuf;
	}

	reasoning(): string {
		return this.reasoningBuf;
	}

	calls(): StreamToolCall[] {
		return this.callBuf
			.filter((c) => c.name)
			.map((c) => ({
				id: c.id || `call_${this.callBuf.indexOf(c)}`,
				name: c.name,
				argsJson: c.args || '{}'
			}));
	}

	get finished(): boolean {
		return this.finishReason === 'stop' || this.finishReason === 'tool_use';
	}
}

/** Slice an SSE byte stream into data payloads (safe across chunks) */
export function createSseLineSplitter(): (chunk: string, flush?: boolean) => string[] {
	let buf = '';
	return (chunk: string, flush = false) => {
		buf += chunk;
		const events: string[] = [];
		let idx: number;
		// SSE events are separated by blank lines
		while ((idx = buf.indexOf('\n\n')) !== -1) {
			const block = buf.slice(0, idx);
			buf = buf.slice(idx + 2);
			const data = block
				.split('\n')
				.filter((l) => l.startsWith('data:'))
				.map((l) => l.slice(5).trimStart())
				.join('\n');
			if (data && data !== '[DONE]') events.push(data);
		}
		if (flush && buf.trim()) {
			const data = buf
				.split('\n')
				.filter((l) => l.startsWith('data:'))
				.map((l) => l.slice(5).trimStart())
				.join('\n');
			if (data && data !== '[DONE]') events.push(data);
			buf = '';
		}
		return events;
	};
}
