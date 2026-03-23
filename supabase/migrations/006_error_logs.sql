-- 錯誤監控表
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  error_type TEXT NOT NULL,  -- 'missing_round', 'memory_lost', 'duplicate_message', 'unpaired_message', 'summary_stale', 'health_check_failed'
  error_detail JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_session ON error_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
