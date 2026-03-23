-- 在 game_sessions 加入角色名稱欄位
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS character_name TEXT;
