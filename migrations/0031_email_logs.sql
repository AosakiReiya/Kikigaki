-- Phase 67a：郵件發送紀錄（每次 provider 呼叫一行；憑證不落此表）
CREATE TABLE IF NOT EXISTS email_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	to_addr TEXT NOT NULL,
	template TEXT NOT NULL DEFAULT 'custom',
	provider TEXT NOT NULL,
	subject TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL,
	error TEXT,
	latency_ms INTEGER,
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_logs_created_idx ON email_logs(created_at DESC);
