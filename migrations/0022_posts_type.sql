-- Phase 52a：內容型別維度（article/devlog/experiment/project）
-- SQLite ALTER 不支援新欄 CHECK 約束；枚舉合法性由應用層（admin save / parse）把關。
ALTER TABLE posts ADD COLUMN type TEXT NOT NULL DEFAULT 'article';

-- 列表按型別過濾（/blog?type=…）
CREATE INDEX posts_type_idx ON posts(type);
