-- Phase 78c batch 4: DB-theme behavior customization (enums & numbers only, zero executable surface)
ALTER TABLE themes ADD COLUMN behaviors TEXT NOT NULL DEFAULT '';
