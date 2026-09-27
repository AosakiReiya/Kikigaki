/**
 * Decision Engine (final layer): rule score + moderation signals → status.
 * Models only provide signals; this is the ONLY place that decides. Swapping models never changes logic.
 *
 * Structure: deterministic base (holds without AI / when AI fails) + AI accelerator (only approves within the mid-risk band).
 * AI is not a single point of dependency — everything still works when the provider is down.
 */
import type { ModerationSignals } from './types';

export type Decision = 'approved' | 'pending' | 'spam';

export const DECISION_THRESHOLDS = {
	/** rule score high enough to treat as spam outright */
	spamByRule: 90,
	/** low risk approves outright */
	approvedBelow: 30,
	/** floor for entering AI moderation */
	moderationBand: 30,
	/** rule ceiling still approved when AI judges safe */
	moderationSafeBelow: 70
} as const;

/**
 * decide(ruleScore, moderation) → Decision
 *
 * deterministic base (always runs first):
 * - ruleScore ≥ 90        → spam
 * - moderation high-risk category → pending (keep a human; outranks low-risk approval)
 * - ruleScore < 30        → approved (instant display)
 *
 * AI accelerator (30–89 mid-risk band only, when AI has a signal):
 * - moderation.spam ≥ 0.9 → spam
 * - low spam & rule < 70  → approved
 * - otherwise (AI unsure) → pending
 */
export interface DecideOptions {
	/** Phase 74: strength presets / custom threshold overrides (absent = DECISION_THRESHOLDS, backward compatible) */
	approvedBelow?: number;
	spamByRule?: number;
	moderationSafeBelow?: number;
	/** banned-word hit → never auto-approve (pending at best) */
	bannedHit?: boolean;
}

export function decide(
	ruleScore: number,
	moderation: ModerationSignals | null,
	opts: DecideOptions = {}
): Decision {
	const spamByRule = opts.spamByRule ?? DECISION_THRESHOLDS.spamByRule;
	const approvedBelow = opts.approvedBelow ?? DECISION_THRESHOLDS.approvedBelow;
	const safeBelow = opts.moderationSafeBelow ?? DECISION_THRESHOLDS.moderationSafeBelow;
	// Deterministic base — high enough to spam outright, AI not consulted
	if (ruleScore >= spamByRule) return 'spam';

	// AI high-risk category keeps human review even with a low rule score
	if (moderation) {
		if (moderation.threat >= 0.8) return 'pending';
		if (moderation.hate >= 0.9) return 'pending';
		if (moderation.harassment >= 0.9) return 'pending';
	}

	// Deterministic base — low risk approves outright (banned-word hits get no auto-approval)
	if (ruleScore < approvedBelow && !opts.bannedHit) return 'approved';

	// AI accelerator — only the mid-risk band can be AI-approved
	if (moderation) {
		if (moderation.spam >= 0.9) return 'spam';
		if (ruleScore < safeBelow && moderation.spam < 0.3 && !opts.bannedHit) {
			return 'approved';
		}
	}

	return 'pending';
}
