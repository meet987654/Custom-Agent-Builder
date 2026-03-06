-- Create tables and constraints

-- PROFILES
create table public.profiles (
  id uuid references auth.users(id) on delete cascade not null primary key,
  email text,
  full_name text,
  avatar_url text,
  role text default 'member' check (role in ('admin', 'member')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- API KEYS
create table public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,
  key_encrypted text not null,
  key_hint text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

-- AGENTS
create table public.agents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  is_template boolean default false,
  cloned_from uuid references public.agents(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TRANSCRIPTS
create table public.transcripts (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references public.agents(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  duration_seconds integer,
  transcript_json jsonb,
  metadata jsonb,
  created_at timestamptz default now()
);

-- LIVEKIT SESSIONS
create table public.livekit_sessions (
  id uuid default gen_random_uuid() primary key,
  room_name text unique not null,
  agent_id uuid references public.agents(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  status text check (status in ('active', 'ended', 'error')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  config_snapshot jsonb
);

-- RLS POLICIES
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

alter table public.api_keys enable row level security;
create policy "Users can view own keys" on public.api_keys for select using (auth.uid() = user_id);
create policy "Users can insert own keys" on public.api_keys for insert with check (auth.uid() = user_id);
create policy "Users can update own keys" on public.api_keys for update using (auth.uid() = user_id);
create policy "Users can delete own keys" on public.api_keys for delete using (auth.uid() = user_id);

alter table public.agents enable row level security;
create policy "Users can view own agents" on public.agents for select using (auth.uid() = user_id or is_template = true);
create policy "Users can insert own agents" on public.agents for insert with check (auth.uid() = user_id);
create policy "Users can update own agents" on public.agents for update using (auth.uid() = user_id);
create policy "Users can delete own agents" on public.agents for delete using (auth.uid() = user_id);

alter table public.transcripts enable row level security;
create policy "Users can view own transcripts" on public.transcripts for select using (auth.uid() = user_id);
create policy "Users can insert own transcripts" on public.transcripts for insert with check (auth.uid() = user_id); -- For client-side inserts if needed, otherwise rely on service role

alter table public.livekit_sessions enable row level security;
create policy "Users can view own sessions" on public.livekit_sessions for select using (auth.uid() = user_id);

-- Seeding Base Template (Section 15 — VAD, STT & Input Validation tuned defaults)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE is_template = true AND name = 'Base Voice Agent Template') THEN
    INSERT INTO public.agents (user_id, name, description, is_template, config)
    VALUES (
      (SELECT id FROM auth.users LIMIT 1), -- Ideally insert a system user ID or handle this differently in real deployment
      'Base Voice Agent Template',
      'Universal starting point. Customize language, prompt, and tools for each client. Production-ready out of the box.',
      true,
      '{
        "language": "en",
        "stt": {
          "provider": "deepgram",
          "model": "nova-3",
          "options": {
            "multilingual": true,
            "smart_format": true,
            "punctuate": true,
            "no_delay": true,
            "endpointing": 400
          }
        },
        "llm": {
          "provider": "gemini",
          "model": "gemini-2.0-flash-001",
          "options": {
            "temperature": 0.7,
            "max_tokens": 256
          }
        },
        "tts": {
          "provider": "cartesia",
          "model": "sonic-2",
          "voice": "794f9389-aac1-45b6-b726-9d9369183238",
          "speed": "normal"
        },
        "vad": {
          "provider": "silero",
          "threshold": 0.85,
          "min_speech_duration_ms": 250,
          "min_silence_duration_ms": 500,
          "speech_pad_ms": 300,
          "barge_in": true,
          "barge_in_min_duration_ms": 300,
          "noise_cancellation": true,
          "silence_timeout_ms": 8000,
          "first_response_timeout_secs": 20
        },
        "input_validation": {
          "enabled": true,
          "min_word_count": 2,
          "min_duration_ms": 1500,
          "confidence_threshold": 0.75,
          "escalation_threshold": 3,
          "max_consecutive_invalid": 5,
          "filler_words": ["uh", "um", "hmm", "hm", "ah", "er", "uhh", "umm", "mmm", "oh"]
        },
        "system_prompt": "You are a helpful, professional voice assistant for [Company Name — customize this].\nYour job is to [describe your purpose here — customize this].\nBe warm, concise, and natural. Keep responses to 1–3 sentences.\nDo not use lists, bullet points, or formatting in your responses.\nYou speak with the user as a knowledgeable, calm, and friendly professional.",
        "voice_gender": "neutral",
        "goodbye_triggers": ["goodbye", "bye", "that's all", "no thanks", "i'm good", "thank you", "धन्यवाद", "बस", "ठीक है", "नमस्ते", "अलविदा", "આભાર", "બસ", "ઠીક છે"],
        "workflow_steps": [
          { "name": "Greeting", "description": "Greet warmly, ask how you can help", "prompt_addition": "" },
          { "name": "Understand", "description": "Gather what the user needs, clarify if unclear", "prompt_addition": "" },
          { "name": "Assist", "description": "Use tools or knowledge to help (only with confirmed data)", "prompt_addition": "" },
          { "name": "Wrap Up", "description": "Confirm completion, ask if anything else is needed", "prompt_addition": "" }
        ],
        "tools": [
          {
            "name": "book_appointment",
            "description": "books an appointment",
            "parameters": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "date": { "type": "string", "description": "YYYY-MM-DD" },
                "time": { "type": "string", "description": "HH:MM" },
                "purpose": { "type": "string" }
              },
              "required": ["name", "date", "time"]
            }
          }
        ],
        "silence_behavior": {
             "messages": [
                 "Are you still there? Take your time.",
                 "I''ll wait a moment longer.",
                 "Thank you for your time. Have a great day!"
             ]
        }
      }'::jsonb
    );
  END IF;
END $$;
