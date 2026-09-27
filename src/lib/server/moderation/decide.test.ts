import { describe, expect, it } from 'vitest';
import { decide, DECISION_THRESHOLDS } from './decide';
import type { ModerationSignals } from './types';

const safe: ModerationSignals = {
	spam: 0.01,
	harassment: 0.0,
	hate: 0.0,
	sexual: 0.0,
	violence: 0.0,
	threat: 0.0
};

describe('decide', () => {
	it('approves low-risk comments immediately', () => {
		expect(decide(5, null)).toBe('approved');
		expect(decide(DECISION_THRESHOLDS.approvedBelow - 1, null)).toBe('approved');
	});

	it('marks very high rule scores as spam', () => {
		expect(decide(90, null)).toBe('spam');
		expect(decide(120, safe)).toBe('spam');
	});

	it('leaves mid-risk comments without AI signals pending', () => {
		expect(decide(55, null)).toBe('pending');
	});

	it('marks spam when AI flags high spam', () => {
		expect(decide(55, { ...safe, spam: 0.95 })).toBe('spam');
	});

	it('holds for review when AI flags threat/hate/harassment', () => {
		expect(decide(55, { ...safe, threat: 0.85 })).toBe('pending');
		expect(decide(55, { ...safe, hate: 0.95 })).toBe('pending');
		expect(decide(55, { ...safe, harassment: 0.92 })).toBe('pending');
	});

	it('approves when AI is confident the mid-risk comment is safe', () => {
		expect(decide(40, safe)).toBe('approved');
		expect(decide(DECISION_THRESHOLDS.moderationSafeBelow - 1, safe)).toBe('approved');
	});

	it('keeps pending when AI is uncertain', () => {
		expect(decide(40, { ...safe, spam: 0.5 })).toBe('pending');
		expect(decide(80, safe)).toBe('pending');
	});
});

describe('Phase 74：可調閾值與禁詞', () => {
	it('custom approvedBelow=50 → 40 分放行（預設會 pending）', () => {
		expect(decide(40, null)).toBe('pending');
		expect(decide(40, null, { approvedBelow: 50 })).toBe('approved');
	});
	it('custom spamByRule=70 → 75 分直接 spam', () => {
		expect(decide(75, null)).toBe('pending');
		expect(decide(75, null, { spamByRule: 70 })).toBe('spam');
	});
	it('off 強度（approvedBelow=101）→ 高分也放行但不過 spam 線', () => {
		expect(
			decide(80, null, { approvedBelow: 101, spamByRule: 999, moderationSafeBelow: 101 })
		).toBe('approved');
	});
	it('bannedHit → 低分也不 auto-approve（最低 pending）', () => {
		expect(decide(5, null, { bannedHit: true })).toBe('pending');
		expect(decide(5, null)).toBe('approved');
	});
	it('bannedHit＋AI 安全帶也不放行', () => {
		const safe = { spam: 0.1, threat: 0, hate: 0, harassment: 0, sexual: 0, violence: 0 };
		expect(decide(50, safe, { bannedHit: true })).toBe('pending');
		expect(decide(50, safe)).toBe('approved');
	});
	it('bannedHit 但分數達 spam 線 → 仍 spam', () => {
		expect(decide(95, null, { bannedHit: true })).toBe('spam');
	});
});
