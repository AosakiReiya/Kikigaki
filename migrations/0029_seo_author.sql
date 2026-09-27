-- Phase 63: post_seo 作者覆寫（JSON-LD author.name；NULL＝站主）
ALTER TABLE post_seo ADD COLUMN seo_author TEXT;
