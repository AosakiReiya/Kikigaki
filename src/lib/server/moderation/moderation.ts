/**
 * AI Moderation second layer: pluggable provider.
 * V1 has no model wired yet; returns null (treated as "no signal" — decide() rules on the rule score).
 *
 * When wiring a model later, have the provider return signals only (0~1 scores), never approved/rejected,
 * so swapping models (Workers AI / OpenAI Moderation / Akismet) requires zero decision-engine changes.
 * Also run Shadow Mode first (just log "what the AI would decide") and gather 100~500 cases before enabling.
 */
import type { ModerationSignals } from './types';

export interface ModerationProvider {
	name: string;
	moderate(content: string): Promise<ModerationSignals | null>;
}

/** no model wired currently */
export const moderationProvider: ModerationProvider = {
	name: 'none',
	async moderate() {
		return null;
	}
};

/** provider down returns null; decide() automatically takes the deterministic fallback — the comment system never breaks */
export async function getModerationSignals(content: string): Promise<ModerationSignals | null> {
	try {
		return await moderationProvider.moderate(content);
	} catch {
		return null;
	}
}
