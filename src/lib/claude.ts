/**
 * Claude API 客戶端
 * 支援 Sonnet（劇情）和 Haiku（查詢/摘要）雙模型路由
 * 支援 Prompt Caching（system content blocks + cache_control）
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const MODELS = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

/** System prompt content block（支援 cache_control） */
export interface SystemContentBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

interface ClaudeResponse {
  content: Array<{ type: "text"; text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null;
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  truncated: boolean;
}

/**
 * 呼叫 Claude API
 * @param systemPrompt - 字串（向後相容）或 content blocks 陣列（支援 prompt caching）
 */
export async function callClaude(
  systemPrompt: string | SystemContentBlock[],
  messages: ClaudeMessage[],
  model: "sonnet" | "haiku" = "sonnet",
  maxTokens: number = 4000
): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  // 字串格式向後相容：自動轉為 content blocks
  const system: string | SystemContentBlock[] =
    typeof systemPrompt === "string"
      ? systemPrompt
      : systemPrompt;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify({
      model: MODELS[model],
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data: ClaudeResponse = await response.json();
  const truncated = data.stop_reason === "max_tokens";

  return {
    text: data.content[0]?.text ?? "",
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    cacheCreationInputTokens: data.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: data.usage.cache_read_input_tokens ?? 0,
    truncated,
  };
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * 用 Haiku 生成摘要
 */
export async function summarizeWithHaiku(
  systemPrompt: string,
  conversationText: string
): Promise<ClaudeResult> {
  return callClaude(
    systemPrompt,
    [{ role: "user", content: conversationText }],
    "haiku",
    500
  );
}

/**
 * 用 Haiku 提取關鍵事實
 */
export async function extractFactsWithHaiku(
  systemPrompt: string,
  conversationText: string
): Promise<ClaudeResult> {
  return callClaude(
    systemPrompt,
    [{ role: "user", content: conversationText }],
    "haiku",
    1000
  );
}
