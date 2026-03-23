-- 玩家音樂問題回報
CREATE TABLE IF NOT EXISTS music_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  current_scene TEXT,
  current_music TEXT,
  recent_dialogue TEXT,
  player_feedback TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_feedback_resolved ON music_feedback(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_music_feedback_created ON music_feedback(created_at DESC);
