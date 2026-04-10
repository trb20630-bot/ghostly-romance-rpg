-- 新增 Facebook OAuth 欄位到 players 表
ALTER TABLE players ADD COLUMN IF NOT EXISTS facebook_id TEXT UNIQUE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS facebook_email TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS facebook_display_name TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS facebook_avatar_url TEXT;

CREATE INDEX IF NOT EXISTS idx_players_facebook ON players(facebook_id);
