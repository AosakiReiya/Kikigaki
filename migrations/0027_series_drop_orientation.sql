-- Phase 59G：移除 orientation（功能歸檔至 archive/series-orientation 分支）
-- SQLite 無法 DROP 帶 CHECK 的欄位（0026 的 CHECK）→ 整表重建。
-- 子表 FK 以表名引用，DROP＋RENAME 後 CASCADE 保持有效（已在副本驗證）。
CREATE TABLE series__new (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  cover TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO series__new (id, slug, cover, published, created_at, updated_at)
SELECT id, slug, cover, published, created_at, updated_at FROM series;

DROP TABLE series;

ALTER TABLE series__new RENAME TO series;
