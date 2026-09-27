-- Phase 70：站內回覆（一層 thread；子評論掛頂層評論的 parent_id）
ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_post_parent_idx ON comments(post_id, parent_id);
