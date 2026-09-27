/**
 * Phase 74 — comment moderation console config: strength presets / custom thresholds / owner banned-word list.
 * Stored in site_settings key `moderation_config` (JSON); pure read/write — decisions stay unified in decide().
 */
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { siteSettings } from '$lib/server/db/schema';
import type { D1Database } from '@cloudflare/workers-types';

export type ModerationStrength = 'off' | 'lenient' | 'normal' | 'strict' | 'custom';

export interface ModerationThresholds {
	/** rule score below this → approve outright */
	approvedBelow: number;
	/** rule score above this → spam outright */
	spamByRule: number;
	/** rule ceiling still approved when the AI says safe */
	moderationSafeBelow: number;
	/** points per banned-word hit (unique words count once) */
	bannedWordScore: number;
}

export interface ModerationConfig {
	strength: ModerationStrength;
	custom: ModerationThresholds;
	bannedWords: string[];
}

export const STRENGTH_PRESETS: Record<
	Exclude<ModerationStrength, 'custom'>,
	ModerationThresholds
> = {
	// off: everything publishes directly (banned words still apply independently — that's the owner's explicit blocklist)
	off: { approvedBelow: 101, spamByRule: 999, moderationSafeBelow: 101, bannedWordScore: 45 },
	lenient: { approvedBelow: 50, spamByRule: 90, moderationSafeBelow: 80, bannedWordScore: 45 },
	normal: { approvedBelow: 30, spamByRule: 90, moderationSafeBelow: 70, bannedWordScore: 45 },
	strict: { approvedBelow: 10, spamByRule: 70, moderationSafeBelow: 45, bannedWordScore: 55 }
};

export const DEFAULT_CONFIG: ModerationConfig = {
	strength: 'normal',
	custom: { ...STRENGTH_PRESETS.normal },
	bannedWords: []
};

/** effective thresholds: custom uses custom values, others use defaults */
export function effectiveThresholds(cfg: ModerationConfig): ModerationThresholds {
	return cfg.strength === 'custom' ? cfg.custom : STRENGTH_PRESETS[cfg.strength];
}

const KEY = 'moderation_config';

export async function getModerationConfig(db: D1Database): Promise<ModerationConfig> {
	const kit = getDb(db);
	const [row] = await kit
		.select({ value: siteSettings.value })
		.from(siteSettings)
		.where(eq(siteSettings.key, KEY))
		.limit(1);
	if (!row?.value) return { ...DEFAULT_CONFIG };
	try {
		const parsed = JSON.parse(row.value) as Partial<ModerationConfig>;
		const strength = (
			['off', 'lenient', 'normal', 'strict', 'custom'] as ModerationStrength[]
		).includes(parsed.strength as ModerationStrength)
			? (parsed.strength as ModerationStrength)
			: 'normal';
		const custom = { ...STRENGTH_PRESETS.normal, ...(parsed.custom ?? {}) };
		// clamping: guard against direct API writes outside the slider range
		custom.approvedBelow = clamp(custom.approvedBelow, 0, 100);
		custom.spamByRule = clamp(custom.spamByRule, 1, 100);
		custom.moderationSafeBelow = clamp(custom.moderationSafeBelow, 0, 100);
		custom.bannedWordScore = clamp(custom.bannedWordScore, 5, 100);
		if (custom.spamByRule <= custom.approvedBelow) custom.spamByRule = custom.approvedBelow + 1;
		const bannedWords = Array.isArray(parsed.bannedWords)
			? parsed.bannedWords
					.filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
					.map((w) => w.trim().toLowerCase())
					.slice(0, 500)
			: [];
		return { strength, custom, bannedWords };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export interface SaveModerationInput {
	strength?: ModerationStrength;
	custom?: Partial<ModerationThresholds>;
	bannedWords?: string[];
}

export async function saveModerationConfig(
	db: D1Database,
	input: SaveModerationInput
): Promise<{ ok: boolean; error?: string; config?: ModerationConfig }> {
	const cur = await getModerationConfig(db);
	const next: ModerationConfig = {
		strength: input.strength ?? cur.strength,
		custom: { ...cur.custom, ...(input.custom ?? {}) },
		bannedWords: Array.isArray(input.bannedWords)
			? input.bannedWords
					.map((w) => String(w).trim().toLowerCase())
					.filter((w) => w.length > 0 && w.length <= 64)
					.slice(0, 500)
			: cur.bannedWords
	};
	if (!(['off', 'lenient', 'normal', 'strict', 'custom'] as string[]).includes(next.strength))
		return { ok: false, error: '無效的強度' };
	const kit = getDb(db);
	const now = new Date();
	await kit
		.insert(siteSettings)
		.values({ key: KEY, value: JSON.stringify(next), updatedAt: now })
		.onConflictDoUpdate({
			target: siteSettings.key,
			set: { value: JSON.stringify(next), updatedAt: now }
		});
	return { ok: true, config: next };
}

function clamp(v: number, lo: number, hi: number): number {
	return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}
