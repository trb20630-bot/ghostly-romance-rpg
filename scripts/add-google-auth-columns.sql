-- ============================================
-- Google Login：擴充 players 表
-- ============================================

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS google_email TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS google_display_name TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS google_avatar_url TEXT;
