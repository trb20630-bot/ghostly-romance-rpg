-- game_sessions 加入 last_active_at 欄位，用於精確判斷在線狀態
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- 初始化：用現有的 updated_at 填充
UPDATE game_sessions SET last_active_at = updated_at WHERE last_active_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_game_sessions_last_active ON game_sessions(last_active_at DESC);
