/**
 * Prompt 分層載入系統（精簡版）
 * 目標：總 context ≈ 2700 tokens
 * 支援 Prompt Caching：靜態規則加 cache_control，動態內容不 cache
 */

import { CORE_SYSTEM_PROMPT, GAME_DATA_PROMPT, shouldUseHaiku } from "./core";
import { CHARACTER_PROMPTS, getNpcPrompt, type CharacterKey } from "./characters";
import { LOCATION_PROMPTS } from "./locations";
import { buildDeathScenePrompt, buildReincarnationPrompt } from "./death-scenes";
import type { SystemContentBlock } from "@/lib/claude";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export interface AssembledPrompt {
  /** @deprecated 向後相容用，優先使用 systemBlocks */
  systemPrompt: string;
  /** System prompt content blocks（支援 prompt caching） */
  systemBlocks: SystemContentBlock[];
  model: "sonnet" | "haiku";
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * 組裝完整的 Prompt（含記憶上下文）
 * 回傳 systemBlocks：靜態部分加 cache_control，動態部分不加
 */
export function assemblePrompt(
  gameState: GameState,
  userMessage: string,
  memory: PlayerMemory | null,
  recentHistory: ChatMessage[]
): AssembledPrompt {
  const model = shouldUseHaiku(userMessage) ? "haiku" : "sonnet";

  // ─── 靜態區塊：核心規則 + 角色設定（整局遊戲不變，適合 cache） ───
  let staticPrompt = CORE_SYSTEM_PROMPT;

  const isStoryPhase = gameState.phase === "story" || gameState.phase === "ending";

  // 角色設定在整局遊戲中固定，歸入靜態區塊
  if (isStoryPhase) {
    if (gameState.player) {
      const charKey = gameState.player.character as CharacterKey;
      if (CHARACTER_PROMPTS[charKey]) {
        staticPrompt += "\n\n" + CHARACTER_PROMPTS[charKey];
      }
    }
    // GAME_DATA 規則只在 story/ending 載入（death/reincarnation 不需要追蹤物品）
    staticPrompt += "\n\n" + GAME_DATA_PROMPT;
  }

  // ─── 動態區塊：每輪可能變化的內容（不 cache） ───
  let dynamicPrompt = "";

  // 注入玩家角色名稱
  if (gameState.player?.characterName) {
    dynamicPrompt += `\n玩家角色名：「${gameState.player.characterName}」`;
  }

  // 根據遊戲階段追加 Prompt
  switch (gameState.phase) {
    case "death":
      if (gameState.player) {
        dynamicPrompt +=
          "\n\n" +
          buildDeathScenePrompt(
            gameState.player.age,
            gameState.player.gender === "male"
              ? "male"
              : gameState.player.gender === "female"
                ? "female"
                : "other",
            gameState.player.occupation
          );
      }
      break;

    case "reincarnation":
      if (gameState.player) {
        dynamicPrompt +=
          "\n\n" + buildReincarnationPrompt(gameState.player.character);
      }
      break;

    case "story":
    case "ending": {
      // NPC 只載入當前場景的（場景會變，不 cache）
      if (gameState.player) {
        const charKey = gameState.player.character as CharacterKey;
        const npcPrompt = getNpcPrompt(charKey, gameState.currentLocation);
        if (npcPrompt) {
          dynamicPrompt += npcPrompt;
        }
      }
      // 場景層（場景會變，不 cache）
      const locationPrompt = LOCATION_PROMPTS[gameState.currentLocation];
      if (locationPrompt) {
        dynamicPrompt += "\n\n" + locationPrompt;
      }
      break;
    }
  }

  // 注入時間狀態（每輪變化，不 cache）
  dynamicPrompt += `\n\n## 當前時間狀態
現在是：${gameState.isDaytime ? "白天（陽光普照）" : "夜晚（月黑風高）"}
已進行回合數：${gameState.roundNumber}

⚠️ 時間軸規則（嚴格遵守）：
1. 故事時間必須連貫，不能跳躍或倒退
2. 如果你提到「明天」「後天」等時間，後續劇情必須遵守
3. 當劇情需要時間推進時（天亮/入夜），請在回覆中明確描述
4. 聶小倩是鬼，白天不能見陽光，必須附著在物品中`;

  // 注入記憶上下文（每輪變化，不 cache）
  if (memory) {
    dynamicPrompt += "\n\n" + buildMemoryContext(memory);
  }

  // GAME_DATA 提醒（只在 story/ending 階段，放在最末尾確保 AI 注意到）
  if (isStoryPhase) {
    dynamicPrompt += `\n\n⚠️ 回覆末尾必須輸出 [GAME_DATA] 區塊（第 4 步）。即使沒有數據變化也要輸出空區塊：
[GAME_DATA]
[/GAME_DATA]`;
  }

  // ─── 組裝 system content blocks ───
  const systemBlocks: SystemContentBlock[] = [
    {
      type: "text",
      text: staticPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  // 動態內容只在有內容時才加入（不加 cache_control）
  if (dynamicPrompt.trim()) {
    systemBlocks.push({
      type: "text",
      text: dynamicPrompt.trim(),
    });
  }

  // 向後相容：合併為完整字串
  const systemPrompt = staticPrompt + dynamicPrompt;

  // 組裝對話歷史（最近 10 輪）
  const messages = recentHistory
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

  return { systemPrompt, systemBlocks, model, messages };
}

/**
 * 將記憶轉化為壓縮 Prompt 上下文（~500 tokens）
 * key_facts：逗號分隔不換行
 * story_summaries：最多 10 條，每條限 150 字，超過時合併最舊的
 */
export function buildMemoryContext(memory: PlayerMemory): string {
  const parts: string[] = ["## 玩家記憶（已發生的事實，必須遵守，不可矛盾）"];

  // 已完成事件（最重要，放最前面）
  const facts = memory.keyFacts;
  const events = facts.completed_events || [];
  if (events.length > 0) {
    parts.push(`已完成事件：${events.join("；")}`);
  }

  // 關鍵事實（逗號分隔，一行內）
  const factEntries: string[] = [];
  if (facts.allies.length > 0) factEntries.push(`盟友:${facts.allies.join(",")}`);
  if (facts.enemies.length > 0) factEntries.push(`敵:${facts.enemies.join(",")}`);
  if (facts.promises.length > 0) factEntries.push(`諾:${facts.promises.join(",")}`);
  if (facts.secrets.length > 0) factEntries.push(`密:${facts.secrets.join(",")}`);
  if (facts.kills.length > 0) factEntries.push(`滅:${facts.kills.join(",")}`);
  if (facts.important_items.length > 0) factEntries.push(`物:${facts.important_items.join(",")}`);
  if (facts.visited_places.length > 0) factEntries.push(`訪:${facts.visited_places.join(",")}`);

  if (factEntries.length > 0) {
    parts.push(factEntries.join("；"));
  }

  // 劇情摘要：保留最近 10 條，超過時合併最舊的 3 條
  if (memory.storySummaries.length > 0) {
    let summaries = [...memory.storySummaries];

    // 超過 10 條時，把最舊的 3 條合併成 1 條
    while (summaries.length > 10) {
      const oldestThree = summaries.slice(0, 3);
      const merged = "【早期】" + oldestThree.map((s) => s.slice(0, 50)).join("；");
      summaries = [merged, ...summaries.slice(3)];
    }

    const trimmed = summaries.map((s) =>
      s.length > 150 ? s.slice(0, 150) + "…" : s
    );
    parts.push("摘要：" + trimmed.join("｜"));
  }

  parts.push("⚠️ 以上記憶中的事件已經發生，你的回覆必須與之一致。");

  return parts.join("\n");
}

/**
 * Haiku 用的摘要生成 Prompt
 */
export const SUMMARY_PROMPT = `你是故事摘要助手。將以下對話壓縮成100字內摘要，保留：關鍵轉折、角色互動、玩家選擇、新秘密。格式：直接輸出摘要文字。`;

/**
 * Haiku 用的關鍵事實提取 Prompt
 */
export const EXTRACT_FACTS_PROMPT = `從對話中提取新增事實，僅回傳精簡JSON，每個欄位最多3項，每項15字內：
{"new_enemies":[],"new_allies":[],"new_promises":[],"new_secrets":[],"new_kills":[],"new_items":[],"new_places":[],"new_events":[],"location_change":null,"time_change":null,"phase_transition":null}
欄位說明：
- new_events：重要劇情里程碑，例如「帶小倩見過家人」「取回骨灰」
- location_change：玩家移動到新地點時填寫地點名（如「金華城」「蘭若寺」），沒移動填null
- time_change：時間變化（如「入夜」「天亮」），沒變化填null
- phase_transition：階段轉換（death→reincarnation→story→ending），沒轉換填null
沒有則留空陣列或null。只回傳JSON。`;

export { shouldUseHaiku } from "./core";
