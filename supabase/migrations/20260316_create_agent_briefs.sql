-- ============================================================
-- 📄 Run this in Supabase SQL Editor before anything else
-- ============================================================
-- Migration: Create agent_briefs table for Client Brief Form
-- Date: 2026-03-16
-- ============================================================

-- AGENT BRIEFS (Client Intake Form data)
create table if not exists public.agent_briefs (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  agent_id      uuid references public.agents(id) on delete cascade,

  -- Step 1: Business Identity
  business_name   text not null,
  industry        text not null check (industry in ('Healthcare', 'Real Estate', 'E-commerce', 'Finance', 'Support', 'Other')),
  primary_language text not null check (primary_language in ('English', 'Hindi', 'Gujarati', 'Other')),
  agent_gender    text not null check (agent_gender in ('Male', 'Female')),

  -- Step 2: Use Case
  use_case_type   text not null check (use_case_type in ('Appointment Booking', 'Lead Qualification', 'Customer Support', 'Survey', 'Outbound Campaign', 'Other')),
  description     text not null,
  key_tasks       text[] not null default '{}',

  -- Step 3: Tone & Behavior
  tone            text not null check (tone in ('Formal', 'Friendly', 'Neutral')),
  strictness      integer not null default 3 check (strictness >= 1 and strictness <= 5),
  handle_objections boolean not null default false,
  forbidden_topics  text,

  -- Timestamps
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Enable RLS
alter table public.agent_briefs enable row level security;

-- RLS Policies: Users can only access their own briefs
create policy "Users can view own briefs"
  on public.agent_briefs for select
  using (auth.uid() = user_id);

create policy "Users can insert own briefs"
  on public.agent_briefs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own briefs"
  on public.agent_briefs for update
  using (auth.uid() = user_id);

create policy "Users can delete own briefs"
  on public.agent_briefs for delete
  using (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists idx_agent_briefs_user_id on public.agent_briefs(user_id);
create index if not exists idx_agent_briefs_agent_id on public.agent_briefs(agent_id);
