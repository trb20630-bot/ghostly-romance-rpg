-- 音樂切換日誌
CREATE TABLE IF NOT EXISTS music_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  from_scene TEXT,
  to_scene TEXT,
  from_music TEXT,
  to_music TEXT,
  ai_response_snippet TEXT,
  is_abnormal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_logs_session ON music_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_music_logs_abnormal ON music_logs(is_abnormal) WHERE is_abnormal = TRUE;
CREATE INDEX IF NOT EXISTS idx_music_logs_created ON music_logs(created_at DESC);
