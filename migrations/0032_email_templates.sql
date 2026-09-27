-- Phase 67b：郵件範本（版本化；DSL source ＋主題模板）
CREATE TABLE IF NOT EXISTS email_templates (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	type TEXT NOT NULL,
	locale TEXT,
	current_version INTEGER NOT NULL DEFAULT 1,
	enabled INTEGER NOT NULL DEFAULT 1,
	is_default INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_template_versions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	template_id TEXT NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
	version INTEGER NOT NULL,
	subject TEXT NOT NULL,
	source TEXT NOT NULL,
	created_by TEXT NOT NULL DEFAULT 'user',
	change_note TEXT,
	created_at INTEGER NOT NULL,
	UNIQUE(template_id, version)
);
CREATE INDEX IF NOT EXISTS etv_tpl_idx ON email_template_versions(template_id, version DESC);
