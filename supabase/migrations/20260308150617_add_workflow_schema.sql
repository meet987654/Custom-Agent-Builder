ALTER TABLE agents ADD COLUMN IF NOT EXISTS workflow_schema JSONB DEFAULT '{"nodes": [], "edges": []}'::jsonb;
