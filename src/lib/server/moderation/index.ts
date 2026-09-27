export { calculateRiskScore, countUrls, containsSpamPattern } from './rules';
export { decide } from './decide';
export { getModerationSignals } from './moderation';
export { verifyTurnstile, TURNSTILE_ACTION } from './turnstile';
export type { TurnstileResult } from './turnstile';
export { matchSpamPatterns } from './patterns/patterns';
export type { SpamPatternMatch } from './patterns/patterns';
export type { ModerationSignals, CommentStatus } from './types';
