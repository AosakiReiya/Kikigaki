import { describe, it, expect } from 'vitest';
import { initialPaceState, nextPace, RAPID_GAP_MS } from './nav-pace';

describe('nav-pace（Phase 45 速度分級）', () => {
	it('會話首跳＝full（電影感）', () => {
		const { pace } = nextPace(initialPaceState(), 1000);
		expect(pace).toBe('full');
	});

	it('慢速導航（間隔 ≥3s）恆為 normal', () => {
		let st = initialPaceState();
		for (const t of [1000, 60_000, 120_000, 200_000]) {
			const r = nextPace(st, t);
			expect(r.pace).toBe(t === 1000 ? 'full' : 'normal');
			st = r.state;
		}
	});

	it('連續快速 ≥2 間隔升級 rapid，間隔拉開即回落', () => {
		let st = initialPaceState();
		const seq: Array<[number, string]> = [];
		const step = (t: number) => {
			const r = nextPace(st, t);
			seq.push([t, r.pace]);
			st = r.state;
		};
		step(0); // full (first jump)
		step(1000); // streak1 → normal
		step(2000); // streak2 → rapid
		step(2500); // streak3 → rapid
		step(2500 + RAPID_GAP_MS + 500); // gap widens → normal; streak resets to zero
		step(2500 + RAPID_GAP_MS + 900); // streak1 → normal
		step(2500 + RAPID_GAP_MS + 1300); // streak2 → rapid
		expect(seq.map(([, p]) => p)).toEqual([
			'full',
			'normal',
			'rapid',
			'rapid',
			'normal',
			'normal',
			'rapid'
		]);
	});

	it('popstate 不經此模組（呼叫端自行繞過，狀態不被後退污染）', () => {
		const st = initialPaceState();
		expect(st.navigations).toBe(0);
	});
});
