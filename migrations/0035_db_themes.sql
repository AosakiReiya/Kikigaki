-- Phase 78c：DB 主題（AI 產主題＋無 Git 換肤；id 恆 db- 前綴，內建 THEME_IDS 永不覆蓋）
CREATE TABLE IF NOT EXISTS themes (
	id TEXT PRIMARY KEY,
	label TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	tokens_css TEXT NOT NULL DEFAULT '',
	surfaces TEXT NOT NULL DEFAULT '{}',
	base TEXT NOT NULL DEFAULT 'abstract',
	version INTEGER NOT NULL DEFAULT 1,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS themes_enabled_idx ON themes(enabled);
