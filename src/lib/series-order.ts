/** series ordering pure logic (Phase 58; admin reorder and e2e share one implementation) */

export const SERIES_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface Positioned {
	postId: string;
	position: number;
}

/** stable-sort by position then renumber 1..n (equal positions keep current order) */
export function normalizePositions<T extends Positioned>(rows: T[]): T[] {
	const sorted = [...rows].sort((a, b) => a.position - b.position);
	return sorted.map((r, i) => ({ ...r, position: i + 1 }));
}

/**
 * Move postId to target position `to` (1-based, out-of-range auto-clamped), shifting the rest.
 * Returns only the rows that changed (for minimal writes).
 */
export function movePosition(rows: Positioned[], postId: string, to: number): Positioned[] {
	const ordered = normalizePositions(rows);
	const from = ordered.findIndex((r) => r.postId === postId);
	if (from === -1) return [];
	const target = Math.min(Math.max(1, Math.trunc(to)), ordered.length);
	if (target === from + 1) return [];
	const [item] = ordered.splice(from, 1);
	ordered.splice(target - 1, 0, item);
	const renumbered = ordered.map((r, i) => ({ ...r, position: i + 1 }));
	const before = new Map(rows.map((r) => [r.postId, r.position]));
	return renumbered.filter((r) => before.get(r.postId) !== r.position);
}
