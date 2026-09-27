-- Phase 51：全站文章全文搜尋（FTS5 · trigram tokenizer）
-- content='post_translations' 外部內容表（不重複存正文），觸發器逐列同步。
-- trigram：任何語言的字串 ≥3 碼點直接 MATCH；兩字 CJK 詞由查詢層回退 LIKE。
CREATE VIRTUAL TABLE posts_fts USING fts5(
  title,
  summary,
  body,
  content = 'post_translations',
  content_rowid = 'rowid',
  tokenize = 'trigram case_sensitive 0'
);

CREATE TRIGGER post_translations_fts_ai AFTER INSERT ON post_translations BEGIN
  INSERT INTO posts_fts(rowid, title, summary, body)
  VALUES (new.rowid, new.title, new.summary, new.body);
END;

CREATE TRIGGER post_translations_fts_ad AFTER DELETE ON post_translations BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, summary, body)
  VALUES ('delete', old.rowid, old.title, old.summary, old.body);
END;

CREATE TRIGGER post_translations_fts_au AFTER UPDATE ON post_translations BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, summary, body)
  VALUES ('delete', old.rowid, old.title, old.summary, old.body);
  INSERT INTO posts_fts(rowid, title, summary, body)
  VALUES (new.rowid, new.title, new.summary, new.body);
END;

-- 既有資料回填（外部內容表標準重建，回填後索引與 post_translations 一致）
INSERT INTO posts_fts(posts_fts) VALUES ('rebuild');
