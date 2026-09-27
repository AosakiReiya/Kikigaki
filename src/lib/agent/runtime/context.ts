/**
 * Context budget utilities (Phase 28 W3) — token estimation, auto-compaction threshold, keep window.
 * Isomorphic to OpenCode context management: char-based estimate, ratio-based trigger, compaction keeps the tail.
 */
import type { AgentMsg } from '$lib/server/ai';

/** ~3.5 chars/token (empirical for this mixed CJK/English site) */
export const CHARS_PER_TOKEN = 3.5;

/** auto-compaction triggers when history reaches this fraction of the context window */
export const AUTO_COMPACT_RATIO = 0.8;

/** recent messages kept by auto-compaction (tail) */
export const AUTO_COMPACT_TAIL = 8;

export function estimateTokens(msgs: Pick<AgentMsg, 'content'>[]): number {
	let chars = 0;
	for (const m of msgs) chars += m.content.length;
	return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface BudgetStatus {
	used: number;
	window: number;
	ratio: number;
	shouldCompact: boolean;
}

export function budgetStatus(used: number, window: number): BudgetStatus | null {
	if (!window || window <= 0) return null;
	const ratio = used / window;
	return { used, window, ratio, shouldCompact: ratio >= AUTO_COMPACT_RATIO };
}
