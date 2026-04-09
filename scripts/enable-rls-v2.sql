-- ============================================
-- v2: 先清除舊 Policy，再啟用 RLS
-- ============================================

-- Step 1: 刪除所有可能已存在的 Policy
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('comments','conversation_logs','game_sessions','player_memory','story_exports','story_likes')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Step 2: 強制啟用 RLS（FORCE 確保連 table owner 也受限）
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

-- Step 3: 建立 Policy

-- comments: 公開讀寫（評論功能）
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_delete" ON public.comments FOR DELETE USING (true);

-- conversation_logs: 僅後端
CREATE POLICY "conversation_logs_service" ON public.conversation_logs
  FOR ALL USING (auth.role() = 'service_role');

-- game_sessions: 僅後端
CREATE POLICY "game_sessions_service" ON public.game_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- player_memory: 僅後端
CREATE POLICY "player_memory_service" ON public.player_memory
  FOR ALL USING (auth.role() = 'service_role');

-- story_exports: 公開讀，僅後端寫
CREATE POLICY "story_exports_select" ON public.story_exports FOR SELECT USING (true);
CREATE POLICY "story_exports_insert" ON public.story_exports FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "story_exports_update" ON public.story_exports FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "story_exports_delete" ON public.story_exports FOR DELETE USING (auth.role() = 'service_role');

-- story_likes: 公開讀寫（按讚功能）
CREATE POLICY "story_likes_select" ON public.story_likes FOR SELECT USING (true);
CREATE POLICY "story_likes_insert" ON public.story_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "story_likes_delete" ON public.story_likes FOR DELETE USING (true);
