-- Phase 72：電子報訂閱者（double opt-in；token 同時作退訂憑證）
CREATE TABLE IF NOT EXISTS subscribers (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	name TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	token TEXT NOT NULL UNIQUE,
	source TEXT NOT NULL DEFAULT 'comment_form',
	locale TEXT,
	created_at INTEGER NOT NULL,
	confirmed_at INTEGER,
	unsubscribed_at INTEGER
);
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers(status);
