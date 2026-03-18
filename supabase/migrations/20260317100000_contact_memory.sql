-- 📄 Run in Supabase FIRST
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  custom_data JSONB DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  total_calls INT DEFAULT 1,
  UNIQUE(agent_id, phone_number)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own agent contacts"
  ON public.contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      WHERE agents.id = contacts.agent_id
      AND agents.user_id = auth.uid()
    )
  );
