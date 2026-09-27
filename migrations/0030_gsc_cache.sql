-- Phase 65b：Search Console 結果快取（inspect 限額 2000/天；分析 12h 一拉）
CREATE TABLE IF NOT EXISTS gsc_cache (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	fetched_at INTEGER NOT NULL
);
