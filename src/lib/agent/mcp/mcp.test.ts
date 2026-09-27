import { describe, it, expect } from 'vitest';
import { sanitizeMcp, mcpToolName } from './registry';
import { openAiToolSpecs, anthropicToolSpecs, type ToolDef } from '$lib/agent/tools';

const base = {
	permission: 'read',
	risk: 'low',
	params: {},
	summary: () => '',
	run: async () => ({ ok: true })
} as unknown as Omit<ToolDef, 'name' | 'description'>;

describe('MCP 工具命名（OpenCode 同構）', () => {
	it('sanitize 非 [a-zA-Z0-9_-] 轉底線', () => {
		expect(sanitizeMcp('my server!')).toBe('my_server_');
		expect(sanitizeMcp('ok-name_1')).toBe('ok-name_1');
	});
	it('toolName = server_tool', () => {
		expect(mcpToolName('mmcp', 'echo')).toBe('mmcp_echo');
		expect(mcpToolName('a b', 'c.d')).toBe('a_b_c_d');
	});
});

describe('rawSchema 直通（MCP 跳過 params 轉換）', () => {
	const def = {
		...base,
		name: 'x_y',
		description: 'd',
		mcp: true,
		rawSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }
	} as ToolDef;
	it('openai specs 帶原生 schema', () => {
		const [spec] = openAiToolSpecs([def]);
		const fn = (spec as { function: { parameters: Record<string, unknown> } }).function;
		expect(fn.parameters.properties).toEqual({ q: { type: 'string' } });
		expect(fn.parameters.required).toEqual(['q']);
	});
	it('缺 properties/required 時補預設', () => {
		const d2 = { ...def, rawSchema: { type: 'object' } } as ToolDef;
		const [spec] = anthropicToolSpecs([d2]);
		const schema = (spec as { input_schema: Record<string, unknown> }).input_schema;
		expect(schema.properties).toEqual({});
		expect(schema.required).toEqual([]);
	});
	it('無 rawSchema 走 params 轉換（內建工具不受影響）', () => {
		const d3 = {
			...base,
			name: 'builtin',
			description: 'x',
			params: { slug: { type: 'string', description: 'd' } }
		} as unknown as ToolDef;
		const [spec] = openAiToolSpecs([d3]);
		const fn = (spec as { function: { parameters: { properties: Record<string, unknown> } } })
			.function;
		expect(fn.parameters.properties.slug).toBeDefined();
	});
});
