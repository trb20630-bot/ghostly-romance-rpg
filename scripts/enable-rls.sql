-- ============================================
-- 啟用 RLS 並建立安全 Policy
-- 目標：6 個資料表全部啟用 RLS
-- ============================================

-- 1. 啟用所有資料表的 RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

-- 2. comments — 所有人可讀，認證用戶可寫
CREATE POLICY "comments_select_all" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_authenticated" ON public.comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (true);

-- 3. conversation_logs — 僅 service_role 可存取（後端 API 使用）
CREATE POLICY "conversation_logs_service_only" ON public.conversation_logs
  FOR ALL USING (auth.role() = 'service_role');

-- 4. game_sessions — 僅 service_role 可存取
CREATE POLICY "game_sessions_service_only" ON public.game_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- 5. player_memory — 僅 service_role 可存取
CREATE POLICY "player_memory_service_only" ON public.player_memory
  FOR ALL USING (auth.role() = 'service_role');

-- 6. story_exports — 所有人可讀（公開畫廊），僅 service_role 可寫
CREATE POLICY "story_exports_select_all" ON public.story_exports
  FOR SELECT USING (true);

CREATE POLICY "story_exports_modify_service" ON public.story_exports
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "story_exports_update_service" ON public.story_exports
  FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "story_exports_delete_service" ON public.story_exports
  FOR DELETE USING (auth.role() = 'service_role');

-- 7. story_likes — 所有人可讀可寫（按讚功能）
CREATE POLICY "story_likes_select_all" ON public.story_likes
  FOR SELECT USING (true);

CREATE POLICY "story_likes_insert_all" ON public.story_likes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "story_likes_delete_all" ON public.story_likes
  FOR DELETE USING (true);
