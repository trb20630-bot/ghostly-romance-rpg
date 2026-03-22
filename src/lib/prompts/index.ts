/**
 * Prompt 分層載入系統
 * 根據遊戲狀態組裝最終的 System Prompt
 */

import { CORE_SYSTEM_PROMPT, shouldUseHaiku } from "./core";
import { CHARACTER_PROMPTS, type CharacterKey } from "./characters";
import { LOCATION_PROMPTS } from "./locations";
import { buildDeathScenePrompt, buildReincarnationPrompt } from "./death-scenes";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export interface AssembledPrompt {
  systemPrompt: string;
  model: "sonnet" | "haiku";
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * 組裝完整的 Prompt（含記憶上下文）
 */
export function assemblePrompt(
  gameState: GameState,
  userMessage: string,
  memory: PlayerMemory | null,
  recentHistory: ChatMessage[]
): AssembledPrompt {
  // 1. 決定使用的模型
  const model = shouldUseHaiku(userMessage) ? "haiku" : "sonnet";

  // 2. 核心層（永遠載入）
  let systemPrompt = CORE_SYSTEM_PROMPT;

  // 3. 根據遊戲階段追加 Prompt
  switch (gameState.phase) {
    case "death":
      if (gameState.player) {
        systemPrompt +=
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
        systemPrompt +=
          "\n\n" + buildReincarnationPrompt(gameState.player.character);
      }
      break;

    case "story":
    case "ending":
      // 角色層
      if (gameState.player) {
        const charKey = gameState.player.character as CharacterKey;
        if (CHARACTER_PROMPTS[charKey]) {
          systemPrompt += "\n\n" + CHARACTER_PROMPTS[charKey];
        }
      }
      // 場景層
      const locationPrompt = LOCATION_PROMPTS[gameState.currentLocation];
      if (locationPrompt) {
        systemPrompt += "\n\n" + locationPrompt;
      }
      break;
  }

  // 4. 注入記憶上下文
  if (memory) {
    systemPrompt += "\n\n" + buildMemoryContext(memory);
  }

  // 5. 組裝對話歷史（最近 15 輪）
  const messages = recentHistory
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

  return { systemPrompt, model, messages };
}

/**
 * 將記憶轉化為 Prompt 上下文
 */
function buildMemoryContext(memory: PlayerMemory): string {
  const parts: string[] = ["## 玩家記憶（重要上下文）"];

  // 關鍵事實
  const facts = memory.keyFacts;
  if (facts.allies.length > 0) parts.push(`盟友：${facts.allies.join("、")}`);
  if (facts.enemies.length > 0) parts.push(`仇人：${facts.enemies.join("、")}`);
  if (facts.promises.length > 0)
    parts.push(`承諾：${facts.promises.join("、")}`);
  if (facts.secrets.length > 0)
    parts.push(`已知秘密：${facts.secrets.join("、")}`);
  if (facts.kills.length > 0)
    parts.push(`已消滅：${facts.kills.join("、")}`);
  if (facts.important_items.length > 0)
    parts.push(`持有物品：${facts.important_items.join("、")}`);
  if (facts.visited_places.length > 0)
    parts.push(`已到訪：${facts.visited_places.join("、")}`);

  // 劇情摘要
  if (memory.storySummaries.length > 0) {
    parts.push("\n### 劇情摘要");
    memory.storySummaries.forEach((s) => parts.push(`- ${s}`));
  }

  return parts.join("\n");
}

/**
 * Haiku 用的摘要生成 Prompt
 */
export const SUMMARY_PROMPT = `你是一個故事摘要助手。請將以下對話壓縮成一段簡短的摘要（50-100字），保留：
1. 關鍵劇情轉折
2. 重要的角色互動
3. 玩家做出的選擇及其結果
4. 新發現的秘密或線索

格式：「第X-Y輪：[摘要內容]」`;

/**
 * Haiku 用的關鍵事實提取 Prompt
 */
export const EXTRACT_FACTS_PROMPT = `你是一個資訊提取助手。從以下對話中提取關鍵事實，以 JSON 格式回傳：

{
  "new_enemies": [],
  "new_allies": [],
  "new_promises": [],
  "new_secrets": [],
  "new_kills": [],
  "new_items": [],
  "new_places": [],
  "location_change": null,
  "time_change": null,
  "phase_transition": null
}

只填入新增的資訊，沒有則留空陣列。location_change 填新地點名或 null。time_change 填 true/false 或 null。phase_transition 填新階段名或 null。`;

export { shouldUseHaiku } from "./core";
