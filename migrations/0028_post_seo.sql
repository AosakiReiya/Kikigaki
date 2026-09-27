-- Phase 61: post_seo —— 文章級 SEO 覆寫（per-locale）
-- 設計原則（roadmap 決策 #1/#2）：
--   1) 獨立表不塞 posts（為 category_seo/page_seo/tag_seo 同型鋪路）
--   2) 覆寫欄位全可空：NULL＝fallback（標題/excerpt/自動 canonical/默認 robots）
--   3) per (post_id, locale)：SERP 按語言覆寫
CREATE TABLE post_seo (
	post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	locale TEXT NOT NULL,
	seo_title TEXT,
	seo_description TEXT,
	canonical_url TEXT,
	robots_index INTEGER NOT NULL DEFAULT 1,
	robots_follow INTEGER NOT NULL DEFAULT 1,
	max_snippet INTEGER,
	max_image_preview TEXT,
	og_title TEXT,
	og_description TEXT,
	og_image TEXT,
	og_image_alt TEXT,
	twitter_card TEXT,
	schema_type TEXT NOT NULL DEFAULT 'Article',
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (post_id, locale)
);
