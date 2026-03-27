-- 010: Prompt Caching 支援 — 新增 cache token 記錄欄位

-- 新增 cache token 記錄欄位
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER DEFAULT 0;

-- 為新欄位加上註解
COMMENT ON COLUMN token_usage.cache_creation_input_tokens IS '建立 cache 時使用的 tokens（首次）';
COMMENT ON COLUMN token_usage.cache_read_input_tokens IS '讀取 cache 時使用的 tokens（後續）';
