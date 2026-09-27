-- Phase 59A：書本卡方向——portrait 直立 3:4（デフォ）/ landscape 横断 16:9
ALTER TABLE series ADD COLUMN orientation TEXT NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait','landscape'));
