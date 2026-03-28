-- =============================================
-- 玩家數據追蹤：銀兩、物品、部屬、技能、好感度
-- =============================================

-- 玩家即時狀態（每個 session 一筆）
CREATE TABLE IF NOT EXISTS player_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  silver INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  affection JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id)
);

-- 玩家數據歷史（每輪變化記錄）
CREATE TABLE IF NOT EXISTS player_stats_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  game_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_player_stats_session ON player_stats(session_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_history_session ON player_stats_history(session_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_history_round ON player_stats_history(session_id, round_number);

-- RLS 策略
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats_history ENABLE ROW LEVEL SECURITY;

-- 允許 service role 完全存取
CREATE POLICY "Service role full access on player_stats"
  ON player_stats FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on player_stats_history"
  ON player_stats_history FOR ALL
  USING (true)
  WITH CHECK (true);
