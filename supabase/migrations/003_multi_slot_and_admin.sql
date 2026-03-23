-- =============================================
-- 多角色存檔 + 管理後台支援
-- =============================================

-- 在 players 表加入 last_active 欄位（追蹤在線狀態）
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ DEFAULT NOW();

-- 管理後台：取得所有玩家 + 角色資訊
CREATE OR REPLACE FUNCTION get_admin_players()
RETURNS TABLE(
  player_id UUID,
  player_name TEXT,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  sessions JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS player_id,
    p.name::TEXT AS player_name,
    p.last_active,
    p.created_at,
    COALESCE(
      (
        SELECT json_agg(row_to_json(s))
        FROM (
          SELECT
            gs.id,
            gs.slot_number,
            gs.chosen_character,
            gs.player_occupation,
            gs.phase,
            gs.round_number,
            gs.current_location,
            gs.updated_at
          FROM game_sessions gs
          WHERE gs.player_id = p.id
          ORDER BY gs.slot_number
        ) s
      ),
      '[]'::JSON
    ) AS sessions
  FROM players p
  ORDER BY p.last_active DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 管理後台：統計數據
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS TABLE(
  total_players BIGINT,
  online_players BIGINT,
  total_sessions BIGINT,
  completed_sessions BIGINT,
  avg_round_number NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM players)::BIGINT,
    (SELECT COUNT(*) FROM players WHERE last_active > NOW() - INTERVAL '5 minutes')::BIGINT,
    (SELECT COUNT(*) FROM game_sessions)::BIGINT,
    (SELECT COUNT(*) FROM game_sessions WHERE phase IN ('ending', 'export'))::BIGINT,
    (SELECT COALESCE(AVG(round_number), 0) FROM game_sessions WHERE round_number > 0)::NUMERIC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
