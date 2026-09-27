import { describe, expect, it } from 'vitest';
import { SERIES_SLUG_RE, movePosition, normalizePositions } from './series-order';

describe('series-order（Phase 58）', () => {
	it('slug 格式：小寫英數連字號，首尾不含連字號', () => {
		expect(SERIES_SLUG_RE.test('building-kikigaki')).toBe(true);
		expect(SERIES_SLUG_RE.test('Building')).toBe(false);
		expect(SERIES_SLUG_RE.test('-x')).toBe(false);
		expect(SERIES_SLUG_RE.test('a b')).toBe(false);
	});

	it('normalizePositions：亂序重編為 1..n 且穩定', () => {
		const out = normalizePositions([
			{ postId: 'c', position: 7 },
			{ postId: 'a', position: 2 },
			{ postId: 'b', position: 5 }
		]);
		expect(out.map((r) => [r.postId, r.position])).toEqual([
			['a', 1],
			['b', 2],
			['c', 3]
		]);
	});

	it('movePosition：往下移，中間項順移，回傳變動集', () => {
		const rows = [
			{ postId: 'a', position: 1 },
			{ postId: 'b', position: 2 },
			{ postId: 'c', position: 3 },
			{ postId: 'd', position: 4 }
		];
		const changed = movePosition(rows, 'a', 3);
		const map = new Map(changed.map((r) => [r.postId, r.position]));
		expect(map).toEqual(
			new Map([
				['b', 1],
				['c', 2],
				['a', 3]
			])
		);
	});

	it('movePosition：原位／不存在＝空變動；越界鉗制', () => {
		const rows = [
			{ postId: 'a', position: 1 },
			{ postId: 'b', position: 2 }
		];
		expect(movePosition(rows, 'a', 1)).toEqual([]);
		expect(movePosition(rows, 'zz', 2)).toEqual([]);
		// b is already last; 99 clamps to 2 → no change
		expect(movePosition(rows, 'b', 99)).toEqual([]);
		const head = movePosition(rows, 'b', 1);
		expect(head).toEqual([
			{ postId: 'b', position: 1 },
			{ postId: 'a', position: 2 }
		]);
	});
});
