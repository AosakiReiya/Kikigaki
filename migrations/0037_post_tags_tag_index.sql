-- 79a-slim: reverse index for tag filtering (/blog?tag= & /api/search) —
-- PK (post_id, tag_id) only served post→tags; tag→posts scanned the join table.
CREATE INDEX IF NOT EXISTS post_tags_tag_id_idx ON post_tags (tag_id);
