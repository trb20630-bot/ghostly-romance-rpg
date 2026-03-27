/**
 * Token 使用量記錄器
 * 每次 Claude API 呼叫後，fire-and-forget 寫入 Supabase
 */

import { createClient } from "@supabase/supabase-js";

// Service role client（繞過 RLS，僅用於伺服器端寫入）
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Anthropic 定價（USD per token）
// cache_read 享 90% 折扣，cache_creation 加 25% 費用
const PRICING = {
  sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  haiku: { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
} as const;

const CACHE_WRITE_MULTIPLIER = 1.25; // cache 寫入 = 基礎價 × 1.25
const CACHE_READ_MULTIPLIER = 0.1;   // cache 讀取 = 基礎價 × 0.1

export interface TokenLogParams {
  sessionId: string | null;
  playerId: string | null;
  roundNumber: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  model: "sonnet" | "haiku";
  endpoint: "chat" | "summarize" | "extract_facts";
}

/**
 * 計算估算費用（含 prompt caching 折扣）
 */
export function estimateCost(
  model: "sonnet" | "haiku",
  inputTokens: number,
  outputTokens: number,
  cacheCreationInputTokens: number = 0,
  cacheReadInputTokens: number = 0
): number {
  const pricing = PRICING[model];
  return (
    inputTokens * pricing.input +
    outputTokens * pricing.output +
    cacheCreationInputTokens * pricing.input * CACHE_WRITE_MULTIPLIER +
    cacheReadInputTokens * pricing.input * CACHE_READ_MULTIPLIER
  );
}

/**
 * 記錄 token 使用量（fire-and-forget，不會阻塞 API 回應）
 */
export async function logTokenUsage(params: TokenLogParams): Promise<void> {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      console.warn("Token logger: missing SUPABASE_SERVICE_ROLE_KEY, skipping");
      return;
    }

    const cost = estimateCost(
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.cacheCreationInputTokens ?? 0,
      params.cacheReadInputTokens ?? 0
    );

    const { error } = await supabase.from("token_usage").insert({
      session_id: params.sessionId || null,
      player_id: params.playerId || null,
      round_number: params.roundNumber,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cache_creation_input_tokens: params.cacheCreationInputTokens ?? 0,
      cache_read_input_tokens: params.cacheReadInputTokens ?? 0,
      model_used: params.model,
      endpoint: params.endpoint,
      estimated_cost: cost,
    });

    if (error) {
      console.warn("Token logger insert error:", error.message);
    }
  } catch (err) {
    // 絕不影響遊戲流程
    console.warn("Token logger failed:", err);
  }
}
