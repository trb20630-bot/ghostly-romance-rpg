-- ============================================
-- LINE Login：擴充 players 表
-- ============================================

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS line_user_id TEXT UNIQUE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS line_display_name TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS line_picture_url TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password';
