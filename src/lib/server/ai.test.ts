import { describe, it, expect } from 'vitest';
import {
	chatRequest,
	listModelsRequest,
	normalizeModelList,
	parseChatResponse,
	inferCapabilities,
	isSafeBaseUrl,
	isProviderType,
	isAiTask,
	buildThinkingParams,
	EFFORT_BUDGET,
	REASONING_MIN_OUTPUT,
	PROVIDER_PRESETS,
	findPresetByUrl,
	isReasoningEffort
} from '$lib/ai/adapters';
import { encryptSecret, decryptSecret, isEncrypted } from './secrets';
import {
	isRetryableProviderError,
	isContextOverflowError,
	parseRetryAfterMs,
	providerBackoffMs,
	effectiveContextWindow,
	DEFAULT_CONTEXT_WINDOW,
	DEFAULT_MAX_OUTPUT,
	DEFAULT_REASONING_BUDGET
} from './ai';

const P = { type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' } as const;

describe('ai adapters: requests', () => {
	it('openai list + chat use Bearer and /chat/completions', () => {
		expect(listModelsRequest(P).url).toBe('https://api.openai.com/v1/models');
		expect(listModelsRequest(P).headers.Authorization).toBe('Bearer sk-test');
		const req = chatRequest(P, {
			model: 'gpt-x',
			messages: [
				{ role: 'system', content: 's' },
				{ role: 'user', content: 'u' }
			]
		});
		expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
		const body = JSON.parse(req.body ?? '{}');
		expect(body.model).toBe('gpt-x');
		expect(body.messages).toHaveLength(2); // openai keeps the system role
	});

	it('anthropic hoists system and uses x-api-key', () => {
		const ap = {
			type: 'anthropic',
			baseUrl: 'https://api.anthropic.com/v1',
			apiKey: 'sk-ant'
		} as const;
		const req = chatRequest(ap, {
			model: 'claude',
			messages: [
				{ role: 'system', content: 'be nice' },
				{ role: 'assistant', content: 'ok' },
				{ role: 'user', content: 'hi' }
			]
		});
		expect(req.url).toBe('https://api.anthropic.com/v1/messages');
		expect(req.headers['x-api-key']).toBe('sk-ant');
		expect(req.headers['anthropic-version']).toBeTruthy();
		const body = JSON.parse(req.body ?? '{}');
		expect(body.system).toBe('be nice');
		expect(body.messages).toHaveLength(2);
	});

	it('google maps roles and puts key in query', () => {
		const g = { type: 'google', baseUrl: 'https://gen/v1beta', apiKey: 'gk' } as const;
		const req = chatRequest(g, {
			model: 'gemini-2',
			messages: [{ role: 'assistant', content: 'a' }]
		});
		expect(req.url).toContain('/models/gemini-2:generateContent?key=gk');
		const body = JSON.parse(req.body ?? '{}');
		expect(body.contents[0].role).toBe('model');
	});
});

describe('ai adapters: response normalization', () => {
	it('openai list', () => {
		expect(normalizeModelList('openai', { data: [{ id: 'gpt-x' }, { id: 'gpt-y' }] })).toEqual([
			{ modelId: 'gpt-x', contextWindow: null },
			{ modelId: 'gpt-y', contextWindow: null }
		]);
	});
	it('anthropic list with display name', () => {
		expect(
			normalizeModelList('anthropic', { data: [{ id: 'claude-a', display_name: 'Claude A' }] })
		).toEqual([{ modelId: 'claude-a', label: 'Claude A', contextWindow: null }]);
	});
	it('context metadata 偵測（Phase 28：context_length/context_window/max_context_tokens）', () => {
		const list = normalizeModelList('openai-compatible', {
			data: [
				{ id: 'm1', context_length: 131072 },
				{ id: 'm2', context_window: 32768 },
				{ id: 'm3', max_context_tokens: 8192 },
				{ id: 'm4', context_length: 5 }
			]
		});
		expect(list.map((x) => x.contextWindow)).toEqual([131072, 32768, 8192, null]);
	});

	it('google list strips models/ prefix', () => {
		expect(
			normalizeModelList('google', {
				models: [{ name: 'models/gemini-2', displayName: 'Gemini 2' }]
			})
		).toEqual([{ modelId: 'gemini-2', label: 'Gemini 2' }]);
	});
	it('chat text extraction per provider', () => {
		expect(parseChatResponse('openai', { choices: [{ message: { content: 'hi' } }] })).toBe('hi');
		expect(parseChatResponse('anthropic', { content: [{ type: 'text', text: 'yo' }] })).toBe('yo');
		expect(
			parseChatResponse('google', { candidates: [{ content: { parts: [{ text: 'olá' }] } }] })
		).toBe('olá');
		expect(parseChatResponse('openai', { unexpected: true })).toBeNull();
	});
});

describe('ai adapters: heuristics & guards', () => {
	it('inferCapabilities', () => {
		expect(inferCapabilities('gpt-5-mini')).toEqual(expect.arrayContaining(['text', 'structured']));
		expect(inferCapabilities('gemini-2.5-pro-vision')).toContain('vision');
		expect(inferCapabilities('mystuff')).toEqual(['text']);
	});
	it('isSafeBaseUrl allows https + localhost http only', () => {
		expect(isSafeBaseUrl('https://api.openai.com/v1')).toBe(true);
		expect(isSafeBaseUrl('http://localhost:8787')).toBe(true);
		expect(isSafeBaseUrl('http://evil.com')).toBe(false);
		expect(isSafeBaseUrl('notaurl')).toBe(false);
	});
	it('type guards', () => {
		expect(isProviderType('anthropic')).toBe(true);
		expect(isProviderType('x')).toBe(false);
		expect(isAiTask('translation')).toBe(true);
		expect(isAiTask('nope')).toBe(false);
	});
});

describe('secrets (AES-256-GCM)', () => {
	it('round-trips', async () => {
		const enc = await encryptSecret('the-secret', 'sk-live-abc123');
		expect(isEncrypted(enc)).toBe(true);
		expect(enc).not.toContain('sk-live');
		expect(await decryptSecret('the-secret', enc)).toBe('sk-live-abc123');
	});
	it('wrong key returns null', async () => {
		const enc = await encryptSecret('a', 'v');
		expect(await decryptSecret('b', enc)).toBeNull();
	});
	it('tampered payload returns null', async () => {
		const enc = await encryptSecret('a', 'v');
		expect(await decryptSecret('a', enc.slice(0, -4) + 'AAAA')).toBeNull();
	});
});

describe('effectiveContextWindow（Phase 28 上限語意）', () => {
	it('用戶未設定（null/0）→ 出廠預設 64000', () => {
		expect(effectiveContextWindow(null, null)).toBe(DEFAULT_CONTEXT_WINDOW);
		expect(effectiveContextWindow(0, null)).toBe(DEFAULT_CONTEXT_WINDOW);
		expect(effectiveContextWindow(undefined, null)).toBe(DEFAULT_CONTEXT_WINDOW);
	});
	it('用戶設定低於 API 上限 → 用用戶值', () => {
		expect(effectiveContextWindow(32_000, 131_072)).toBe(32_000);
	});
	it('用戶設定超過 API 上限 → 封頂', () => {
		expect(effectiveContextWindow(200_000, 131_072)).toBe(131_072);
	});
	it('API 未回傳上限 → 用戶值直用（預設兜底）', () => {
		expect(effectiveContextWindow(128_000, null)).toBe(128_000);
		expect(effectiveContextWindow(null, 0)).toBe(DEFAULT_CONTEXT_WINDOW);
	});
	it('預設三常數', () => {
		expect(DEFAULT_CONTEXT_WINDOW).toBe(64_000);
		expect(DEFAULT_MAX_OUTPUT).toBe(8192);
		expect(DEFAULT_REASONING_BUDGET).toBe(8192);
	});
});

describe('thinking 參數映射（Phase 29 DeepSeek/Aliyun）', () => {
	it('deepseek：off→disabled；effort 透傳', () => {
		const off = buildThinkingParams('deepseek', 'off', null, false);
		expect(off.fields).toEqual({ thinking: { type: 'disabled' } });
		expect(off.thinkingOn).toBe(false);
		const on = buildThinkingParams('deepseek', 'medium', null, true);
		expect(on.fields).toEqual({ thinking: { type: 'enabled' }, reasoning_effort: 'medium' });
		expect(on.thinkingOn).toBe(true);
	});
	it('deepseek：effort null → high（官方預設）', () => {
		const r = buildThinkingParams('deepseek', null, 4096, true);
		expect(r.fields.reasoning_effort).toBe('high');
	});
	it('dashscope/通用：enable_thinking＋budget（effort 換算表）', () => {
		const r = buildThinkingParams('dashscope', 'low', null, true);
		expect(r.fields).toEqual({ enable_thinking: true, thinking_budget: EFFORT_BUDGET.low });
		const b = buildThinkingParams(null, 'max', 12345, true);
		expect(b.fields.thinking_budget).toBe(12345);
	});
	it('budget 型 off → 不發欄位（通用）', () => {
		const r = buildThinkingParams('dashscope', 'off', null, false);
		expect(r.fields).toEqual({});
	});
	it('下限與常數', () => {
		expect(REASONING_MIN_OUTPUT).toBe(16384);
		expect(EFFORT_BUDGET.high).toBe(16384);
		expect(isReasoningEffort('max')).toBe(true);
		expect(isReasoningEffort('ultra')).toBe(false);
	});
	it('presets：deepseek/aliyun URL 匹配與目錄', () => {
		const ds = findPresetByUrl('https://api.deepseek.com/v1');
		expect(ds?.family).toBe('deepseek');
		expect(ds?.models?.some((m) => m.modelId === 'deepseek-v4-pro')).toBe(true);
		const al = findPresetByUrl('https://dashscope.aliyuncs.com/compatible-mode/v1');
		expect(al?.family).toBe('dashscope');
		expect(PROVIDER_PRESETS.find((x) => x.id === 'openrouter')?.baseUrl).toBe(
			'https://openrouter.ai/api/v1'
		);
	});
});

describe('provider 錯誤分類與退避（Phase 31.1/31.5）', () => {
	it('retryable：5xx/429/網路/timeout 是；400/overflow 否', () => {
		expect(isRetryableProviderError('upstream_503（busy）')).toBe(true);
		expect(isRetryableProviderError('upstream_429（rate）|retry-after:2')).toBe(true);
		expect(isRetryableProviderError('network_TimeoutError')).toBe(true);
		expect(isRetryableProviderError('provider_timeout（60s 無串流資料）')).toBe(true);
		expect(isRetryableProviderError('upstream_400（bad request）')).toBe(false);
		expect(isRetryableProviderError('upstream_413（context too long）')).toBe(false);
	});
	it('overflow 偵測', () => {
		expect(isContextOverflowError('upstream_400（context_length_exceeded）')).toBe(true);
		expect(isContextOverflowError('maximum context length reached')).toBe(true);
		expect(isContextOverflowError('upstream_500')).toBe(false);
	});
	it('retry-after 解析（ms 與秒；上限 20s）', () => {
		expect(parseRetryAfterMs('x|retry-after-ms:250')).toBe(250);
		expect(parseRetryAfterMs('x|retry-after:3')).toBe(3000);
		expect(parseRetryAfterMs('x|retry-after:999')).toBe(20_000);
		expect(parseRetryAfterMs('no header')).toBeNull();
	});
	it('退避：2s×2^n 上限 10s＋jitter ±20%', () => {
		expect(providerBackoffMs(1)).toBeGreaterThanOrEqual(1600);
		expect(providerBackoffMs(1)).toBeLessThanOrEqual(2400);
		expect(providerBackoffMs(9)).toBeLessThanOrEqual(12000);
	});
});
