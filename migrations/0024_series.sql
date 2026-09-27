-- Phase 58：Series 系統——有序文章群（一稿多系；position 依系列獨立；主系列決定篇內導覽）
CREATE TABLE series (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  cover TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE series_translations (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX series_translations_series_locale_idx ON series_translations(series_id, locale);

CREATE TABLE series_posts (
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (series_id, post_id)
);

CREATE INDEX series_posts_series_pos_idx ON series_posts(series_id, position);
