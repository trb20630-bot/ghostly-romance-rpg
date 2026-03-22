-- =============================================
-- 倩女幽魂 AI RPG — 完整資料庫 Schema
-- =============================================

-- 啟用 UUID 擴展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- 1. 玩家表
-- =============================================
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_auth ON players(auth_user_id);

-- =============================================
-- 2. 遊戲存檔表
-- =============================================
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  slot_number INTEGER DEFAULT 1 CHECK (slot_number BETWEEN 1 AND 3),

  -- 玩家角色資料
  player_age INTEGER,
  player_gender TEXT CHECK (player_gender IN ('male', 'female', 'other')),
  player_occupation TEXT,
  chosen_character TEXT CHECK (chosen_character IN ('聶小倩', '寧采臣')),

  -- 遊戲進度
  phase TEXT DEFAULT 'setup' CHECK (phase IN (
    'setup', 'character', 'death', 'reincarnation', 'story', 'ending', 'export'
  )),
  round_number INTEGER DEFAULT 0,
  current_location TEXT DEFAULT '現代',
  is_daytime BOOLEAN DEFAULT TRUE,

  -- 故事匯出
  story_exported BOOLEAN DEFAULT FALSE,
  story_export_url TEXT,

  -- 時間戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(player_id, slot_number)
);

CREATE INDEX idx_sessions_player ON game_sessions(player_id);

-- =============================================
-- 3. 完整對話紀錄表（雲端永久保存）
-- =============================================
CREATE TABLE conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  token_count INTEGER,
  model_used TEXT CHECK (model_used IN ('sonnet', 'haiku')),
  phase TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_logs_session ON conversation_logs(session_id, round_number);
CREATE INDEX idx_conv_logs_phase ON conversation_logs(session_id, phase);

-- =============================================
-- 4. 玩家記憶表（AI 上下文用）
-- =============================================
CREATE TABLE player_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,

  -- 第一層：關鍵事實（永久保留）
  key_facts JSONB DEFAULT '{
    "enemies": [],
    "allies": [],
    "promises": [],
    "secrets": [],
    "kills": [],
    "learned_skills": [],
    "visited_places": [],
    "important_items": []
  }',

  -- 第二層：劇情摘要（滾動更新）
  story_summaries JSONB DEFAULT '[]',

  -- 第三層追蹤
  last_summarized_round INTEGER DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 5. 故事匯出表
-- =============================================
CREATE TABLE story_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chapters JSONB NOT NULL DEFAULT '[]',
  total_words INTEGER DEFAULT 0,
  format TEXT DEFAULT 'markdown' CHECK (format IN ('markdown', 'txt', 'html')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 6. RLS 政策（Row Level Security）
-- =============================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_exports ENABLE ROW LEVEL SECURITY;

-- 玩家只能存取自己的資料
CREATE POLICY "players_own" ON players
  FOR ALL USING (auth_user_id = auth.uid());

CREATE POLICY "sessions_own" ON game_sessions
  FOR ALL USING (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "conv_logs_own" ON conversation_logs
  FOR ALL USING (
    session_id IN (
      SELECT gs.id FROM game_sessions gs
      JOIN players p ON gs.player_id = p.id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "memory_own" ON player_memory
  FOR ALL USING (
    session_id IN (
      SELECT gs.id FROM game_sessions gs
      JOIN players p ON gs.player_id = p.id
      WHERE p.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "exports_own" ON story_exports
  FOR ALL USING (
    session_id IN (
      SELECT gs.id FROM game_sessions gs
      JOIN players p ON gs.player_id = p.id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- =============================================
-- 7. 自動更新 updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_players_updated
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_sessions_updated
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_memory_updated
  BEFORE UPDATE ON player_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
