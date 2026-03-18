-- 📄 Run in Supabase SQL Editor FIRST

-- 1. Create agent_briefs table
CREATE TABLE IF NOT EXISTS public.agent_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  primary_language TEXT NOT NULL,
  agent_gender TEXT CHECK (agent_gender IN ('Male','Female','Neutral', 'male','female','neutral')),
  use_case_type TEXT NOT NULL,
  use_case_description TEXT,
  key_tasks JSONB DEFAULT '[]'::jsonb,
  tone TEXT CHECK (tone IN ('Formal','Friendly','Neutral', 'formal','friendly','neutral')),
  strictness_level INT CHECK (strictness_level BETWEEN 1 AND 5),
  handle_objections BOOLEAN DEFAULT true,
  forbidden_topics TEXT,
  contact_memory_enabled BOOLEAN DEFAULT true,
  contact_fields JSONB DEFAULT '["name","phone"]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Alter agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS workflow_schema JSONB,
  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES public.agent_briefs(id);

-- 3. RLS Policies for agent_briefs
ALTER TABLE public.agent_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent_briefs" 
  ON public.agent_briefs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent_briefs" 
  ON public.agent_briefs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent_briefs" 
  ON public.agent_briefs FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent_briefs" 
  ON public.agent_briefs FOR DELETE 
  USING (auth.uid() = user_id);
