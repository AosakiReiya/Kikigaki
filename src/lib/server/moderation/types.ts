export type CommentStatus = 'approved' | 'pending' | 'rejected' | 'spam';

/** AI moderation signals (0~1 scores). Models only provide signals; decide() always makes the call. */
export interface ModerationSignals {
	spam: number;
	harassment: number;
	hate: number;
	sexual: number;
	violence: number;
	threat: number;
}
