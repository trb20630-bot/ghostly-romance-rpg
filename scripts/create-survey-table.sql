-- ============================================
-- 建立 survey_responses 資料表 + RLS
-- ============================================

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL,
  session_id UUID,
  overall_rating INT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  story_rating INT NOT NULL CHECK (story_rating BETWEEN 1 AND 5),
  ai_quality_rating INT NOT NULL CHECK (ai_quality_rating BETWEEN 1 AND 5),
  option_coherence_rating INT NOT NULL CHECK (option_coherence_rating BETWEEN 1 AND 5),
  character_rating INT NOT NULL CHECK (character_rating BETWEEN 1 AND 5),
  pacing_rating INT NOT NULL CHECK (pacing_rating BETWEEN 1 AND 5),
  preferred_genres TEXT[] NOT NULL DEFAULT '{}',
  preferred_length TEXT NOT NULL,
  suggestions TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 每個玩家只能填一次
CREATE UNIQUE INDEX IF NOT EXISTS survey_responses_player_unique ON public.survey_responses (player_id);

-- 啟用 RLS
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Policy：僅 service_role 可存取（後端 API 操作）
CREATE POLICY "survey_responses_service_only" ON public.survey_responses
  FOR ALL USING (auth.role() = 'service_role');
