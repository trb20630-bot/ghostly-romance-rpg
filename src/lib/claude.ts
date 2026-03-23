/**
 * Claude API 客戶端
 * 支援 Sonnet（劇情）和 Haiku（查詢/摘要）雙模型路由
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

interface ClaudeResponse {
  content: Array<{ type: "text"; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  model: "sonnet" | "haiku" = "sonnet",
  maxTokens: number = 1500
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS[model],
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error (${response.status}): ${error}`);
  }

  const data: ClaudeResponse = await response.json();

  return {
    text: data.content[0]?.text ?? "",
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
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
    500
  );
}
