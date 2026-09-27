/**
 * Agent Runtime unit tests (pure-logic parts: policy / limiters / stream parsing).
 * The state machine and D1 behavior are covered by E2E.
 */
import { describe, it, expect } from 'vitest';
import {
	budgetExceeded,
	toolAccess,
	DEFAULT_RUN_LIMITS,
	stepsPerAdvance,
	isSelfHost,
	maxAutoToolsPerRequest,
	planAutoBatch,
	gatedForWorkshop
} from './policy';
import { ToolStreamAccumulator, createSseLineSplitter } from '$lib/ai/adapters';
import { componentStaticIssues, visibleTools, validateArgs, toolByName } from '../tools';
import { toAgentMsgs, HISTORY_LIMIT } from './store';
import { findCompactCutoff } from './compact';

describe('approval policy（模式 × 風險）', () => {
	it('chat：只有 read 可見，其餘不可見不執行', () => {
		for (const r of ['low', 'medium', 'high', 'critical'] as const) {
			expect(toolAccess('chat', r)).toEqual({
				visible: false,
				needsApproval: false,
				autoExecute: false
			});
		}
		expect(toolAccess('chat', 'read').autoExecute).toBe(true);
	});
	it('plan：副作用工具全部轉提案（含 low/medium）；read 與元工具直走', () => {
		expect(toolAccess('plan', 'low').needsApproval).toBe(true);
		expect(toolAccess('plan', 'medium').needsApproval).toBe(true);
		expect(toolAccess('plan', 'read').autoExecute).toBe(true);
		expect(toolAccess('plan', 'read', true)).toEqual({
			visible: true,
			needsApproval: false,
			autoExecute: true
		});
	});
	it('agent：read/low/medium 自主；high/critical 暫停等人批', () => {
		expect(toolAccess('agent', 'medium').autoExecute).toBe(true);
		expect(toolAccess('agent', 'high').needsApproval).toBe(true);
		expect(toolAccess('agent', 'critical').needsApproval).toBe(true);
	});
});

describe('Workshop 協作紀律', () => {
	it('IDE 情境下 registry 註冊一律降審批；read/dev 工具不受影響', () => {
		expect(gatedForWorkshop('create_component', true)).toBe(true);
		expect(gatedForWorkshop('update_component', true)).toBe(true);
		expect(gatedForWorkshop('component_dev', true)).toBe(false);
		expect(gatedForWorkshop('save_page', true)).toBe(false);
		expect(gatedForWorkshop('create_component', false)).toBe(false);
	});
});

describe('run 限制器（防失控）', () => {
	const ok = {
		stepsUsed: 3,
		toolCallsUsed: 5,
		totalTokens: 1000,
		wallMs: 1000,
		consecutiveFailures: 0
	};
	it('預算內 → null', () => expect(budgetExceeded(ok, DEFAULT_RUN_LIMITS)).toBeNull());
	it('步數／工具數／token／牆鐘／連續失敗各有上限', () => {
		expect(budgetExceeded({ ...ok, stepsUsed: 24 }, DEFAULT_RUN_LIMITS)).toBe(
			'step_budget_exceeded'
		);
		expect(budgetExceeded({ ...ok, toolCallsUsed: 60 }, DEFAULT_RUN_LIMITS)).toBe(
			'tool_call_budget_exceeded'
		);
		expect(budgetExceeded({ ...ok, totalTokens: 200_000 }, DEFAULT_RUN_LIMITS)).toBe(
			'token_budget_exceeded'
		);
		expect(budgetExceeded({ ...ok, wallMs: 31 * 60_000 }, DEFAULT_RUN_LIMITS)).toBe(
			'wall_clock_exceeded'
		);
		expect(budgetExceeded({ ...ok, consecutiveFailures: 4 }, DEFAULT_RUN_LIMITS)).toBe(
			'consecutive_failures'
		);
	});
	it('advance 每次請求至多 1 個 provider step（Phase 56 預算守門）', () =>
		expect(stepsPerAdvance()).toBe(isSelfHost() ? 10 : 1));
});

describe('compact 邊界（安全切割點）', () => {
	const r = (role: string, hasCalls = false) => ({ role, hasCalls });
	it('太短回 0', () => {
		expect(findCompactCutoff([r('user'), r('assistant')], 8)).toBe(0);
	});
	it('從 keepLast 向前找到 user 邊界', () => {
		const rows = [
			r('user'),
			...Array.from({ length: 20 }, (_, i) => r(i % 2 ? 'tool' : 'assistant', true)),
			r('user'),
			r('assistant')
		];
		const cut = findCompactCutoff(rows, 8);
		expect(rows[cut]?.role).toBe('user');
	});
	it('純 tool 迴圈無安全點 → 0（不硬切）', () => {
		const rows = [
			r('user'),
			...Array.from({ length: 30 }, (_, i) => r(i % 2 ? 'tool' : 'assistant', true))
		];
		expect(findCompactCutoff(rows, 8)).toBe(0);
	});
});

describe('provider streaming parsers', () => {
	it('openai：文字 delta ＋ 分片 tool_calls 按 index 聚合 ＋ usage', () => {
		const acc = new ToolStreamAccumulator('openai');
		expect(acc.feed(JSON.stringify({ choices: [{ delta: { content: '你' } }] }))).toBe('你');
		acc.feed(
			JSON.stringify({
				choices: [{ delta: { content: '好' } }]
			})
		);
		acc.feed(
			JSON.stringify({
				choices: [
					{
						delta: {
							tool_calls: [
								{ index: 0, id: 'call_1', function: { name: 'read_', arguments: '{"sla' } }
							]
						}
					}
				]
			})
		);
		acc.feed(
			JSON.stringify({
				choices: [
					{
						delta: { tool_calls: [{ index: 0, function: { name: 'post', arguments: 'g":"x"}' } }] }
					}
				]
			})
		);
		acc.feed(
			JSON.stringify({
				choices: [
					{
						delta: {
							tool_calls: [
								{ index: 1, id: 'call_2', function: { name: 'site_stats', arguments: '{}' } }
							]
						},
						finish_reason: 'tool_calls'
					}
				]
			})
		);
		acc.feed(JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
		expect(acc.text()).toBe('你好');
		expect(acc.calls()).toEqual([
			{ id: 'call_1', name: 'read_post', argsJson: '{"slag":"x"}' },
			{ id: 'call_2', name: 'site_stats', argsJson: '{}' }
		]);
		expect(acc.usage).toEqual({ input: 10, output: 5 });
	});

	it('anthropic：text delta ＋ input_json_delta 聚合 ＋ stop/usage', () => {
		const acc = new ToolStreamAccumulator('anthropic');
		acc.feed(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 42 } } }));
		expect(
			acc.feed(
				JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '嗨' } })
			)
		).toBe('嗨');
		acc.feed(
			JSON.stringify({
				type: 'content_block_start',
				content_block: { type: 'tool_use', id: 'tu_1', name: 'get_post' }
			})
		);
		acc.feed(
			JSON.stringify({
				type: 'content_block_delta',
				delta: { type: 'input_json_delta', partial_json: '{"slug' }
			})
		);
		acc.feed(
			JSON.stringify({
				type: 'content_block_delta',
				delta: { type: 'input_json_delta', partial_json: '":"a"}' }
			})
		);
		acc.feed(
			JSON.stringify({
				type: 'message_delta',
				delta: { stop_reason: 'tool_use' },
				usage: { output_tokens: 7 }
			})
		);
		expect(acc.text()).toBe('嗨');
		expect(acc.calls()).toEqual([{ id: 'tu_1', name: 'get_post', argsJson: '{"slug":"a"}' }]);
		expect(acc.usage).toEqual({ input: 42, output: 7 });
		expect(acc.finished).toBe(true);
	});

	it('SSE 切分：跨 chunk、多行 data、[DONE]', () => {
		const split = createSseLineSplitter();
		expect(split('data: {"a":')).toEqual([]);
		expect(split('1}\n\nda')).toEqual(['{"a":1}']);
		expect(split('ta: x\n\ndata: [DONE]\n\n')).toEqual(['x']);
	});
});

describe('history 重組（W0：保留最新而非最舊）', () => {
	const row = (role: string, content: string, extra: Record<string, unknown> = {}) => ({
		role,
		content,
		toolCalls: JSON.stringify(extra['toolCalls'] ?? []),
		toolCallId: (extra['toolCallId'] as string | undefined) ?? null
	});
	it('toAgentMsgs 排除 system 並還原 toolCalls/toolCallId', () => {
		const msgs = toAgentMsgs([
			row('system', 'ignore'),
			row('user', 'hi'),
			row('assistant', '', { toolCalls: [{ id: 'c1', name: 'list_posts', args: {} }] }),
			row('tool', '{}', { toolCallId: 'c1' })
		]);
		expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
		expect(msgs[1].toolCalls?.[0]?.name).toBe('list_posts');
		expect(msgs[2].toolCallId).toBe('c1');
	});
	it('HISTORY_LIMIT 存在且為正數（buildHistory desc+reverse 由 E2E 長史驗證）', () => {
		expect(HISTORY_LIMIT).toBeGreaterThan(100);
	});
});

describe('tools registry v2（風險分層）', () => {
	it('每個工具都有 risk；高風險工具存在', () => {
		const all = visibleTools('agent');
		const byName = toolByName('delete_post');
		expect(byName?.risk).toBe('high');
		expect(toolByName('publish_post')?.risk).toBe('high');
		expect(toolByName('create_component')?.risk).toBe('medium');
		expect(toolByName('save_page')?.risk).toBe('medium');
		expect(toolByName('create_post')?.risk).toBe('low');
		expect(all.length).toBeGreaterThan(20);
	});
	it('Phase 55：動態分類四工具已註冊', () => {
		const names = visibleTools('agent').map((t) => t.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'list_categories',
				'create_category',
				'save_category_translation',
				'set_post_category'
			])
		);
	});
	it('Phase 58.6：set_post_series_only 已註冊', () => {
		const names = visibleTools('agent').map((t) => t.name);
		expect(names).toContain('set_post_series_only');
	});
	it('Phase 58：系列五工具已註冊', () => {
		const names = visibleTools('agent').map((t) => t.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'list_series',
				'create_series',
				'update_series',
				'save_series_translation',
				'add_post_to_series',
				'remove_post_from_series'
			])
		);
	});
	it('chat 模式不出現元工具與寫入工具', () => {
		const names = visibleTools('chat').map((t) => t.name);
		expect(names).not.toContain('update_plan');
		expect(names).not.toContain('save_page');
		expect(names).toContain('list_posts');
	});
	it('update_plan 需 runtime（舊迴圈呼叫會被擋）', () => {
		const def = toolByName('update_plan');
		expect(def?.special).toBe(true);
	});
	it('array 參數驗證', () => {
		const def = toolByName('update_plan')!;
		expect(validateArgs(def, { steps: 'not-array' }).length).toBe(1);
		expect(validateArgs(def, { steps: [] })).toEqual([]);
	});
	it('元件靜態檢查抓到危險 construct 與標籤失衡', () => {
		expect(componentStaticIssues('Bad_Name', '<script></' + 'script>').length).toBeGreaterThan(0);
		const issues = componentStaticIssues('ok-name', '<script>let x = eval("1");</' + 'script><p/>');
		expect(issues.some((i) => i.includes('eval'))).toBe(true);
	});
});

describe('Phase 56：請求級預算守門', () => {
	it('stepsPerAdvance：CF 恆 1、self-host 增壓 10（平台感知）', () => {
		const before = process.env.SELF_HOST;
		delete process.env.SELF_HOST;
		expect(stepsPerAdvance()).toBe(1);
		process.env.SELF_HOST = '1';
		expect(stepsPerAdvance()).toBe(10);
		process.env.SELF_HOST_STEPS = '4';
		expect(stepsPerAdvance()).toBe(4);
		process.env.SELF_HOST_STEPS = '999';
		expect(stepsPerAdvance()).toBe(25);
		delete process.env.SELF_HOST_STEPS;
		if (before === undefined) delete process.env.SELF_HOST;
		else process.env.SELF_HOST = before;
	});
	it('planAutoBatch：≤ cap 全數執行', () => {
		const q = [1, 2, 3, 4];
		expect(planAutoBatch(q)).toEqual({ execute: q, deferred: [] });
	});
	it('planAutoBatch：超出部分遞延且保持建立序', () => {
		const q = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		const r = planAutoBatch(q, maxAutoToolsPerRequest());
		expect(r.execute).toEqual(['a', 'b', 'c', 'd']);
		expect(r.deferred).toEqual(['e', 'f', 'g']);
	});
});

describe('Phase 59 parity 工具註冊', () => {
	it('comments/settings/analytics 九工具已註冊且風險分層正確', () => {
		const names = visibleTools('agent').map((t) => t.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'list_comments',
				'set_comment_status',
				'delete_comment',
				'get_site_settings',
				'update_site_settings',
				'set_ui_theme',
				'set_agent_instructions',
				'set_page_nav',
				'get_analytics',
				'list_media',
				'delete_media'
			])
		);
		expect(toolByName('delete_comment')?.risk).toBe('high');
		expect(toolByName('set_agent_instructions')?.risk).toBe('high');
		expect(toolByName('list_comments')?.risk).toBe('read');
		expect(toolByName('get_analytics')?.risk).toBe('read');
		expect(toolByName('update_site_settings')?.risk).toBe('medium');
		expect(toolByName('set_comment_status')?.risk).toBe('low');
		expect(toolByName('delete_media')?.risk).toBe('high');
	});
});

describe('Phase 61 SEO 工具註冊', () => {
	it('get_post_seo / update_post_seo 已註冊且風險分層正確', () => {
		const names = visibleTools('agent').map((t) => t.name);
		expect(names).toEqual(expect.arrayContaining(['get_post_seo', 'update_post_seo']));
		expect(toolByName('get_post_seo')?.risk).toBe('read');
		expect(toolByName('update_post_seo')?.risk).toBe('medium');
	});
});
