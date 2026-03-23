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
const PRICING = {
  sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  haiku: { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
} as const;

export interface TokenLogParams {
  sessionId: string | null;
  playerId: string | null;
  roundNumber: number;
  inputTokens: number;
  outputTokens: number;
  model: "sonnet" | "haiku";
  endpoint: "chat" | "summarize" | "extract_facts";
}

/**
 * 計算估算費用
 */
export function estimateCost(
  model: "sonnet" | "haiku",
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = PRICING[model];
  return inputTokens * pricing.input + outputTokens * pricing.output;
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

    const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);

    const { error } = await supabase.from("token_usage").insert({
      session_id: params.sessionId || null,
      player_id: params.playerId || null,
      round_number: params.roundNumber,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
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
