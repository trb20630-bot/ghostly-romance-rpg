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
 * 呼叫 Claude API（含 529 過載自動重試）
 * @param systemPrompt - 字串（向後相容）或 content blocks 陣列（支援 prompt caching）
 */
export async function callClaude(
  systemPrompt: string | SystemContentBlock[],
  messages: ClaudeMessage[],
  model: "sonnet" | "haiku" = "sonnet",
  maxTokens: number = 6000,
  maxRetries: number = 3
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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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

      // 529 過載錯誤：等待後重試
      if (response.status === 529) {
        const waitTime = 2000 + attempt * 1500; // 2s, 3.5s, 5s
        console.warn(`[Claude API] 529 過載，第 ${attempt + 1}/${maxRetries} 次重試，等待 ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

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
    } catch (error) {
      lastError = error as Error;
      // 非 529 錯誤直接拋出
      if (!lastError.message.includes('529')) {
        throw lastError;
      }
    }
  }

  // 重試次數用盡
  throw new Error(`Claude API 伺服器忙碌中，請稍後再試（已重試 ${maxRetries} 次）`);
}

export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * 用 Haiku 檢查選項是否符合敘事上下文
 * 失敗時預設通過，不阻擋遊戲流程
 */
export async function validateChoicesWithHaiku(
  choices: string[],
  narrative: string,
  character: string,
  location: string
): Promise<{ valid: boolean; invalidChoices: string[]; reason?: string }> {
  if (choices.length < 3) {
    return { valid: false, invalidChoices: [], reason: "選項不足三個" };
  }

  const prompt = `你是選項品質檢查器。判斷以下三個選項是否符合敘事上下文。

【最近敘事】
${narrative.slice(-800)}

【玩家角色】${character}
【當前地點】${location}

【選項】
A. ${choices[0] || "（空）"}
B. ${choices[1] || "（空）"}
C. ${choices[2] || "（空）"}

【檢查標準】
1. 選項必須與上方敘事內容相關
2. 選項必須包含敘事中出現的人名、地名或物品
3. 不能是泛用選項，例如：觀察周圍、思考一下、繼續前進、仔細查看、回想線索、整理思緒
4. 三個選項不能意思重複

【輸出】
只輸出一個 JSON，不要其他文字：
- 全部通過：{"valid": true}
- 有問題：{"valid": false, "invalidChoices": ["A", "B"], "reason": "簡短說明問題"}`;

  try {
    const result = await callClaude(prompt, [{ role: "user", content: "請檢查" }], "haiku", 200);
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        valid: parsed.valid ?? false,
        invalidChoices: parsed.invalidChoices ?? [],
        reason: parsed.reason,
      };
    }
    console.warn("[Haiku 檢查] JSON 解析失敗，預設通過");
    return { valid: true, invalidChoices: [] };
  } catch (error) {
    console.error("[Haiku 檢查] 錯誤:", error);
    return { valid: true, invalidChoices: [] };
  }
}

/**
 * 用 Haiku 根據敘事內容重新生成高品質選項
 */
export async function regenerateChoicesWithHaiku(
  narrative: string,
  character: string,
  location: string,
  reason: string
): Promise<string[]> {
  const prompt = `你是古風RPG選項生成器。根據以下敘事重新生成三個高品質選項。

原因：${reason}

【敘事內容】
${narrative.slice(-600)}

【玩家角色】${character}
【當前地點】${location}

【要求】
1. 必須引用敘事中出現的具體人物、地點或物品
2. 禁止泛用選項：「觀察周圍」「思考一下」「繼續前進」「仔細查看」「回想線索」「整理思緒」
3. 每個選項必須有明確動詞+對象
4. 三個選項指向不同的劇情方向

【格式】
只輸出三行：
A. [具體選項]
B. [具體選項]
C. [具體選項]`;

  try {
    const result = await callClaude(prompt, [{ role: "user", content: "請生成" }], "haiku", 300);
    const choices: string[] = [];
    for (const line of result.text.split("\n")) {
      const match = line.match(/^[A-Ca-c][.、）)]\s*(.+)/);
      if (match?.[1]) choices.push(match[1].trim());
    }
    return choices.slice(0, 3);
  } catch (error) {
    console.error("[重新生成選項] 錯誤:", error);
    return [];
  }
}

/**
 * 用 Haiku 驗證 GAME_DATA 是否符合敘事上下文（純文字格式）
 * 失敗時預設通過，不阻擋遊戲流程
 */
export async function validateGameDataWithHaiku(
  gameData: {
    silver: number;
    items: { add: string[]; remove: string[] };
    followers: { add: string[]; remove: string[] };
    skills: string[];
    relationships: Record<string, number>;
  },
  narrative: string,
  character: string,
  location: string,
  roundCounter: number
): Promise<{ valid: boolean; invalidFields: string[]; reason?: string }> {
  // 組合變動描述
  const changes: string[] = [];
  if (gameData.silver) changes.push(`銀兩${gameData.silver > 0 ? '+' : ''}${gameData.silver}`);
  if (gameData.items.add.length) changes.push(`+物品:${gameData.items.add.join(',')}`);
  if (gameData.items.remove.length) changes.push(`-物品:${gameData.items.remove.join(',')}`);
  if (gameData.followers.add.length) changes.push(`+部屬:${gameData.followers.add.join(',')}`);
  if (gameData.skills.length) changes.push(`+技能:${gameData.skills.join(',')}`);
  if (Object.keys(gameData.relationships).length) {
    const rels = Object.entries(gameData.relationships).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`);
    changes.push(`好感:${rels.join(',')}`);
  }

  // 如果沒有任何變動，直接通過
  if (changes.length === 0) {
    console.log(`[狀態驗證] 第 ${roundCounter} 輪: 無變動，跳過驗證`);
    return { valid: true, invalidFields: [] };
  }

  console.log(`[狀態驗證] 第 ${roundCounter} 輪`);
  console.log(`[狀態驗證] 變動: ${changes.join(', ')}`);

  const prompt = `驗證狀態變動是否符合敘事。

【敘事】
${narrative.slice(-800)}

【角色】${character}
【地點】${location}

【變動】
${changes.join('\n')}

【規則】
- 物品必須在敘事中被提到或合理獲得
- 銀兩必須有交易或獲得描述
- 部屬必須在敘事中加入隊伍
- 技能必須在敘事中學會或領悟
- 好感變動的NPC必須在敘事中出現

【輸出】
全部符合輸出一行：
VALID

有問題輸出三行：
INVALID
欄位:有問題的欄位用逗號分隔
原因:簡短說明`;

  try {
    const result = await callClaude(prompt, [{ role: "user", content: "請驗證" }], "haiku", 100);
    const text = result.text.trim();
    const lines = text.split('\n').map(l => l.trim());
    const firstLine = lines[0];

    if (firstLine === 'VALID') {
      console.log(`[狀態驗證] Haiku: VALID`);
      console.log(`[狀態驗證] ✅ 已通過`);
      return { valid: true, invalidFields: [] };
    }

    if (firstLine === 'INVALID') {
      const fieldsLine = lines.find(l => l.startsWith('欄位:'));
      const reasonLine = lines.find(l => l.startsWith('原因:'));
      const fields = fieldsLine?.replace('欄位:', '').split(',').map(f => f.trim()) || [];
      const reason = reasonLine?.replace('原因:', '').trim() || '驗證失敗';

      console.log(`[狀態驗證] Haiku: INVALID`);
      console.log(`[狀態驗證] 欄位: ${fields.join(', ')}`);
      console.log(`[狀態驗證] 原因: ${reason}`);
      console.log(`[狀態驗證] ❌ 已拒絕`);

      return { valid: false, invalidFields: fields, reason };
    }

    // 無法解析，預設通過
    console.warn(`[狀態驗證] 無法解析 Haiku 回應: ${text}`);
    console.log(`[狀態驗證] ⚠️ 預設通過`);
    return { valid: true, invalidFields: [] };

  } catch (error) {
    console.error(`[狀態驗證] Haiku 錯誤:`, error);
    console.log(`[狀態驗證] ⚠️ 錯誤時預設通過`);
    return { valid: true, invalidFields: [] };
  }
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
