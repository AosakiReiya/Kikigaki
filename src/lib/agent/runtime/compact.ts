/**
 * Context compaction (Phase 25·W4) — opencode-style Compact.
 *
 * Strategy: keep the latest keepLast messages; older ones are rewritten in place into a single
 * "summary user message", the rest deleted. The event log is untouched (UI conversation replays
 * from events; compaction only affects the history sent to the provider). The boundary comes from
 * findCompactCutoff: the cut point must land on a "user" or an "assistant without toolCalls",
 * otherwise the provider would receive orphan tool_results / unfinished tool_uses.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { chat } from '$lib/server/ai';
import { applyCompactRewrite, getAllMessageRows } from './store';
import { estimateTokens } from './context';

const SUMMARY_HEADER = '〔前情摘要（自動壓縮）〕';

/**
 * rows: id-ascending message sequence (role column). Returns the "keep-region start index";
 * <= 0 means no compaction needed/possible.
 */
/**
 * rows: id-ascending sequence. The keep-region start must be a clean boundary (user, or an
 * assistant without toolCalls whose previous row isn't a tool result). Searches backward from
 * len-keepLast for the nearest safe point; returns 0 (no compaction) when none found.
 */
export function findCompactCutoff(
	rows: { role: string; hasCalls?: boolean }[],
	keepLast: number
): number {
	const n = rows.length;
	if (n <= keepLast + 4) return 0;
	const safe = (i: number): boolean => {
		if (i <= 0 || i >= n) return false;
		const r = rows[i];
		if (r.role === 'tool') return false;
		if (r.role === 'assistant' && r.hasCalls) return false;
		// previous row must not be an "assistant with toolCalls but missing results" (theoretically impossible),
		// and the keep region must not start with an orphan tool — guaranteed by role !== tool
		const prev = rows[i - 1];
		if (prev.role === 'assistant' && prev.hasCalls && r.role !== 'tool') return false;
		return true;
	};
	for (let c = n - keepLast; c > 0; c--) {
		if (safe(c)) return c;
	}
	return 0;
}

function ruleSummary(lines: string[]): string {
	const users = lines.filter((l) => l.startsWith('使用者：')).slice(-12);
	return `${SUMMARY_HEADER}\n${users.join('\n').slice(0, 3000) || '（早期對話為工具往返，重點：見下方最近對話）'}`;
}

export interface CompactResult {
	summarized: number;
	kept: number;
}

/** run compaction; null = not needed or failed (failure rewrites nothing) */
export async function compactSession(
	db: D1Database,
	secret: string | undefined,
	sessionId: string,
	keepLast = 8,
	auto = false
): Promise<CompactResult | null> {
	const rows = await getAllMessageRows(db, sessionId);
	const cut = findCompactCutoff(rows, keepLast);
	if (cut <= 0) return null;
	const old = rows.slice(0, cut);
	const transcript = old
		.map((r) => {
			const who = r.role === 'user' ? '使用者' : r.role === 'assistant' ? '助理' : '工具';
			return `${who}：${r.content.slice(0, 500)}`;
		})
		.join('\n')
		.slice(0, 24000);

	let summary: string;
	if (secret) {
		const r = await chat(db, secret, {
			task: 'summarization',
			messages: [
				{
					role: 'system',
					content:
						'你是對話歷史壓縮器。把以下 Agent 對話歷史濃縮成條列式繁體中文摘要（≤600 字），必須保留：使用者意圖與決策、已完成的具體操作（名稱/slug/結果）、進行中工作、未竟事項、關鍵事實。直接輸出摘要，不加寒暄。'
				},
				{ role: 'user', content: transcript }
			],
			maxTokens: 800
		});
		summary =
			r.ok && r.text
				? `${SUMMARY_HEADER}\n${r.text.trim().slice(0, 3000)}`
				: ruleSummary(transcript.split('\n'));
	} else {
		summary = ruleSummary(transcript.split('\n'));
	}

	await applyCompactRewrite(db, sessionId, old[0].id, rows[cut].id, summary);
	void auto;
	return { summarized: old.length - 1, kept: rows.length - old.length };
}

/**
 * 31.6 Prune (read-time version of OpenCode compaction.prune):
 * protects tool outputs within PRUNE_PROTECT_TOKENS from the tail; older oversized tool results
 * are replaced with placeholder text (affects only the history sent to the model, not the DB = audit intact).
 */
export const PRUNE_PROTECT_TOKENS = 40_000;
const PRUNE_MIN_CONTENT = 500;

export function pruneToolOutputs<T extends { role: string; content: string }>(
	msgs: T[],
	protectTokens = PRUNE_PROTECT_TOKENS
): T[] {
	let budget = protectTokens;
	const out = [...msgs];
	for (let i = out.length - 1; i >= 0; i--) {
		const m = out[i];
		const cost = estimateTokens([m]);
		if (budget >= cost) {
			budget -= cost;
			continue;
		}
		if (m.role === 'tool' && m.content.length > PRUNE_MIN_CONTENT) {
			out[i] = { ...m, content: '[已清理：較舊的工具輸出（pruned；如需可重新執行）]' };
		}
	}
	return out;
}
