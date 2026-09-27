-- Phase 58.6：文章層級「僅在系列中顯示」——列表語境（/blog、首頁、搜尋、標籤頁、計數）隱藏，
-- 直鏈與書內不受影響；EXISTS 半索引供系列歸屬快速判定
ALTER TABLE posts ADD COLUMN series_only INTEGER NOT NULL DEFAULT 0;

-- 系列歸屬存在性（set membership 查詢與 sonly 聯動都用得上）
CREATE INDEX series_posts_post_idx ON series_posts(post_id);
