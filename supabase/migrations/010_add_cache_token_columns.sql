-- 010: Prompt Caching 支援 — 新增 cache token 統計欄位
-- 記錄每次 API 呼叫的 cache 建立/讀取 token 數量

ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER DEFAULT 0;

-- 為 admin dashboard 查詢加速（按日期+模型統計 cache 命中率）
CREATE INDEX IF NOT EXISTS idx_token_usage_cache
ON token_usage (created_at, model_used)
WHERE cache_read_input_tokens > 0;
