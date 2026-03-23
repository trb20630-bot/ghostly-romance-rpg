-- =============================================
-- Token 監控系統
-- =============================================

CREATE TABLE token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions(id) ON DELETE SET NULL,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
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

-- 允許 service role 寫入（API routes 用 service role key）
-- 管理員可讀取所有資料
CREATE POLICY "token_usage_insert" ON token_usage
  FOR INSERT WITH CHECK (true);

CREATE POLICY "token_usage_select_own" ON token_usage
  FOR SELECT USING (
    player_id IN (SELECT id FROM players WHERE auth_user_id = auth.uid())
  );

-- =============================================
-- 管理員統計用 RPC 函數
-- =============================================

-- 今日 / 本週總消耗
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
    COUNT(*)::BIGINT AS total_requests,
    COALESCE(SUM(tu.input_tokens), 0)::BIGINT AS total_input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)::BIGINT AS total_output_tokens,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC AS total_cost,
    COUNT(*) FILTER (WHERE tu.model_used = 'sonnet')::BIGINT AS sonnet_requests,
    COUNT(*) FILTER (WHERE tu.model_used = 'haiku')::BIGINT AS haiku_requests,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens) FILTER (WHERE tu.model_used = 'sonnet'), 0)::BIGINT AS sonnet_tokens,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens) FILTER (WHERE tu.model_used = 'haiku'), 0)::BIGINT AS haiku_tokens
  FROM token_usage tu
  WHERE tu.created_at >= CASE
    WHEN period = 'today' THEN date_trunc('day', NOW())
    WHEN period = 'week' THEN NOW() - INTERVAL '7 days'
    WHEN period = 'month' THEN NOW() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 每位玩家的消耗量
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
    p.id AS player_id,
    COALESCE(p.display_name, '未命名') AS display_name,
    COUNT(tu.id)::BIGINT AS total_requests,
    COALESCE(SUM(tu.input_tokens), 0)::BIGINT AS total_input_tokens,
    COALESCE(SUM(tu.output_tokens), 0)::BIGINT AS total_output_tokens,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC AS total_cost
  FROM players p
  LEFT JOIN token_usage tu ON tu.player_id = p.id
  GROUP BY p.id, p.display_name
  ORDER BY total_cost DESC;
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
    COUNT(tu.id)::BIGINT AS total_requests,
    COALESCE(SUM(tu.input_tokens + tu.output_tokens), 0)::BIGINT AS total_tokens,
    COALESCE(SUM(tu.estimated_cost), 0)::NUMERIC AS total_cost,
    CASE WHEN COUNT(tu.id) > 0
      THEN ROUND(SUM(tu.input_tokens + tu.output_tokens)::NUMERIC / COUNT(tu.id), 0)
      ELSE 0
    END AS avg_tokens_per_request
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
