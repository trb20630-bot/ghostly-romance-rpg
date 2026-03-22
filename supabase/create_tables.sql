CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  slot_number INTEGER DEFAULT 1,
  player_age INTEGER,
  player_gender TEXT,
  player_occupation TEXT,
  chosen_character TEXT,
  phase TEXT DEFAULT 'setup',
  round_number INTEGER DEFAULT 0,
  current_location TEXT,
  is_daytime BOOLEAN DEFAULT TRUE,
  story_exported BOOLEAN DEFAULT FALSE,
  story_export_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, slot_number)
);

CREATE TABLE conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  model_used TEXT,
  phase TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_session ON conversation_logs(session_id, round_number);

CREATE TABLE player_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
  key_facts JSONB DEFAULT '{}',
  story_summaries JSONB DEFAULT '[]',
  last_summarized_round INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE story_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chapters JSONB NOT NULL DEFAULT '[]',
  total_words INTEGER DEFAULT 0,
  format TEXT DEFAULT 'markdown',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
