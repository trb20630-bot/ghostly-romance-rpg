-- 允許 players.name 為 NULL
-- 目的：OAuth 登入（Google/Facebook）新用戶先建立空帳號，之後在 /platform/setup-profile 設定暱稱
-- Bug: 新 Google 用戶 POST /api/auth/google/sync 時會插入 name: null，觸發 23502 not-null violation
ALTER TABLE players ALTER COLUMN name DROP NOT NULL;
