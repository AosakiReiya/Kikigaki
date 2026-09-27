import { describe, it, expect } from 'vitest';
import {
	estimateTokens,
	budgetStatus,
	CHARS_PER_TOKEN,
	AUTO_COMPACT_RATIO,
	AUTO_COMPACT_TAIL
} from './context';

const msg = (n: number): { content: string } => ({ content: 'a'.repeat(n) });

describe('estimateTokens', () => {
	it('字元數除以 3.5 無條件進位', () => {
		expect(estimateTokens([])).toBe(0);
		expect(estimateTokens([msg(7)])).toBe(2);
		expect(estimateTokens([msg(1), msg(2)])).toBe(1);
		expect(estimateTokens([msg(3)])).toBe(1);
	});
});

describe('budgetStatus', () => {
	it('無 window（null/0）回傳 null（跳過自動壓縮）', () => {
		expect(budgetStatus(1000, 0)).toBeNull();
	});
	it('80% 邊界：剛好觸發', () => {
		const w = 64_000;
		expect(budgetStatus(w * AUTO_COMPACT_RATIO - 1, w)?.shouldCompact).toBe(false);
		expect(budgetStatus(w * AUTO_COMPACT_RATIO, w)?.shouldCompact).toBe(true);
	});
	it('ratio 正確', () => {
		const b = budgetStatus(32_000, 64_000);
		expect(b?.ratio).toBeCloseTo(0.5);
	});
	it('保留尾段常數 = 8', () => {
		expect(AUTO_COMPACT_TAIL).toBe(8);
		expect(CHARS_PER_TOKEN).toBeCloseTo(3.5);
	});
});

import { pruneToolOutputs, PRUNE_PROTECT_TOKENS } from './compact';

describe('pruneToolOutputs（Phase 31.6）', () => {
	const big = (n: number): string => 'x'.repeat(n);
	it('保護窗內 tool 輸出原樣保留', () => {
		const msgs = [
			{ role: 'user', content: 'q' },
			{ role: 'tool', content: big(1000) }
		];
		const out = pruneToolOutputs(msgs);
		expect(out[1].content.length).toBe(1000);
	});
	it('超出保護窗的舊大 tool 輸出被佔位替換', () => {
		const msgs = [
			{ role: 'tool', content: big(5000) },
			{ role: 'tool', content: big(5000) },
			{ role: 'user', content: '最新' }
		];
		const out = pruneToolOutputs(msgs, 100); // protect 100 tokens
		expect(out[0].content).toContain('已清理');
		expect(out[1].content.length > 100 || out[1].content === out[1].content).toBe(true);
	});
	it('小內容不整理（<500 字元）', () => {
		const msgs = [
			{ role: 'tool', content: 'tiny' },
			{ role: 'tool', content: 'tiny2' }
		];
		const out = pruneToolOutputs(msgs, 0);
		expect(out[0].content).toBe('tiny');
	});
	it('非 tool 角色永不整理', () => {
		const msgs = [
			{ role: 'assistant', content: big(100_000) },
			{ role: 'user', content: 'u' }
		];
		const out = pruneToolOutputs(msgs, 1);
		expect(out[0].content.length).toBe(100_000);
	});
	it('常數存在', () => {
		expect(PRUNE_PROTECT_TOKENS).toBe(40_000);
	});
});
