-- ============================================================
-- 📄 Run this in Supabase SQL Editor (if not already present)
-- ============================================================
-- Ensures the workflow_schema column exists on agents table
-- Used by: Workflow Studio auto-save + Brief-to-flow generation
-- ============================================================

ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS workflow_schema JSONB;
