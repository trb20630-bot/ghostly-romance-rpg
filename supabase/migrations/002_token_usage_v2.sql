-- =============================================
-- Token 監控系統（修正版：移除不存在的 auth_user_id / display_name）
-- =============================================

-- 如果已建立過舊版，先清除
DROP TABLE IF EXISTS token_usage CASCADE;
DROP FUNCTION IF EXISTS get_token_stats(TEXT);
DROP FUNCTION IF EXISTS get_player_token_usage();
DROP FUNCTION IF EXISTS get_daily_token_trend();

-- =============================================
-- 建立 token_usage 表
-- =============================================
CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  player_id UUID,
  round_number INTEGER,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  model_used TEXT NOT NULL CHECK (model_used IN ('sonnet', 'haiku')),
  endpoint TEXT NOT NULL,  -- 'chat', 'summarize', 'extract_facts'
  estimated_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_token_usage_session ON token_usage(session_id);
CREATE INDEX idx_token_usage_player ON token_usage(player_id);
CREATE INDEX idx_token_usage_created ON token_usage(created_at);
CREATE INDEX idx_token_usage_model ON token_usage(model_used);

-- RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_usage_insert" ON token_usage
  FOR INSERT WITH CHECK (true);

CREATE POLICY "token_usage_select_own" ON token_usage
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM game_sessions
      WHERE player_id = auth.uid()
    )
  );

-- =============================================
-- 統計函數
-- =============================================

-- 今日 / 本週 / 本月 總消耗
CREATE OR REPLACE FUNCTION get_token_stats(period TEXT)
RETURNS TABLE(
  total_requests BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC,
  sonnet_requests BIGINT,
  haiku_requests BIGINT,
  sonnet_tokens BIGINT,
  haiku_tokens BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COALESCE(SUM(tu.input_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.output_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE tu.model_used = 'sonnet')::BIGINT,
    COUNT(*) FILTER (WHERE tu.model_used = 'haiku')::BIGINT,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens) FILTER (WHERE tu.model_used = 'sonnet'), 0)::BIGINT,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens) FILTER (WHERE tu.model_used = 'haiku'), 0)::BIGINT
  FROM token_usage tu
  WHERE tu.created_at >= CASE
    WHEN period = 'today' THEN date_trunc('day', NOW())
    WHEN period = 'week' THEN NOW() - INTERVAL '7 days'
    WHEN period = 'month' THEN NOW() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 每位玩家的消耗量（透過 game_sessions 取角色＋職業當顯示名稱）
CREATE OR REPLACE FUNCTION get_player_token_usage()
RETURNS TABLE(
  player_id UUID,
  display_name TEXT,
  total_requests BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.player_id,
    COALESCE(
      gs.chosen_character || ' (' || gs.player_occupation || ')',
      gs.player_id::TEXT
    ),
    COUNT(tu.id)::BIGINT,
    COALESCE(SUM(tu.input_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.output_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC
  FROM token_usage tu
  JOIN game_sessions gs ON gs.id = tu.session_id
  GROUP BY gs.player_id, gs.chosen_character, gs.player_occupation
  ORDER BY COALESCE(SUM(tu.estimated_cost), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 每日趨勢（最近 14 天）
CREATE OR REPLACE FUNCTION get_daily_token_trend()
RETURNS TABLE(
  day DATE,
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost NUMERIC,
  avg_tokens_per_request NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.day::DATE,
    COUNT(tu.id)::BIGINT,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC,
    CASE WHEN COUNT(tu.id) > 0
      THEN ROUND(SUM(tu.input_tokens + tu.output_tokens)::NUMERIC / COUNT(tu.id), 0)
      ELSE 0
    END
  FROM generate_series(
    (NOW() - INTERVAL '13 days')::DATE,
    NOW()::DATE,
    '1 day'::INTERVAL
  ) d(day)
  LEFT JOIN token_usage tu ON tu.created_at::DATE = d.day
  GROUP BY d.day
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
