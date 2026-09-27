-- Phase 28 follow-up: API-returned context window as maximum ceiling.
-- Semantics: effective = min(user setting ?? default 64000, api cap ?? unbounded).
ALTER TABLE ai_models ADD COLUMN api_context_window INTEGER;
-- Backfill: current values (mostly imported provider caps) become the ceiling.
UPDATE ai_models SET api_context_window = context_window WHERE context_window IS NOT NULL;
