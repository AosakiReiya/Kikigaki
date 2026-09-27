-- Phase 55：動態分類系統——posts.type 語意升級為「分類 slug」，分類本身成為一等公民
-- （鏡像標籤：DB 管理 ＋ 多語系譯名 ＋ agent 工具；欄位保留不搬家，DEFAULT 'article' 零回填）
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX categories_sort_idx ON categories(sort);

CREATE TABLE category_translations (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX category_translations_cat_locale_idx ON category_translations(category_id, locale);

-- seed：既有四型別（基準名 zh-tw），排序＝原 POST_TYPES 順序
INSERT INTO categories (id, slug, name, sort, created_at, updated_at) VALUES
  ('category:article', 'article', '文章', 1, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('category:devlog', 'devlog', '開發紀錄', 2, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('category:experiment', 'experiment', '實驗', 3, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('category:project', 'project', '專案', 4, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);

-- 四語系譯名（自 messages/*.json type_* 鍵搬入，前台顯示名自此歸 DB）
INSERT INTO category_translations (id, category_id, locale, name, created_at, updated_at) VALUES
  ('ct:article:zh-cn', 'category:article', 'zh-cn', '文章', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:article:en', 'category:article', 'en', 'Article', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:article:jp', 'category:article', 'jp', '記事', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:devlog:zh-cn', 'category:devlog', 'zh-cn', '开发纪录', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:devlog:en', 'category:devlog', 'en', 'Devlog', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:devlog:jp', 'category:devlog', 'jp', '開発記録', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:experiment:zh-cn', 'category:experiment', 'zh-cn', '实验', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:experiment:en', 'category:experiment', 'en', 'Experiment', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:experiment:jp', 'category:experiment', 'jp', '実験', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:project:zh-cn', 'category:project', 'zh-cn', '项目', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:project:en', 'category:project', 'en', 'Project', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('ct:project:jp', 'category:project', 'jp', 'プロジェクト', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000);
