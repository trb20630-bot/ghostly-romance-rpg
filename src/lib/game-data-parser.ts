/**
 * GAME_DATA 解析器 + 玩家數據更新
 * 從 AI 回覆中提取 [GAME_DATA]...[/GAME_DATA] JSON，寫入資料庫
 */

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 內部統一格式（與資料庫欄位對應） */
export interface GameData {
  silver_change?: number;
  new_items?: string[];
  lost_items?: string[];
  new_subordinates?: string[];
  lost_subordinates?: string[];
  new_skills?: string[];
  affection_changes?: Record<string, number>;
}

export interface ParseResult {
  cleanResponse: string;
  gameData: GameData | null;
}

/**
 * 將 AI 輸出的中文鍵 GAME_DATA 正規化為內部格式
 *
 * AI 輸出格式（中文鍵 + 原因）：
 * { "銀兩": { "變化": 50, "原因": "..." }, "物品": { "獲得": [], "失去": [] }, ... }
 *
 * 同時向下相容舊的英文鍵格式（silver_change, new_items 等）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeGameData(raw: any): GameData | null {
  if (!raw || typeof raw !== "object") return null;

  const result: GameData = {};

  // 銀兩 — 中文鍵或英文鍵
  if (raw["銀兩"]?.["變化"] != null) {
    result.silver_change = Number(raw["銀兩"]["變化"]) || 0;
  } else if (raw.silver_change != null) {
    result.silver_change = Number(raw.silver_change) || 0;
  }

  // 物品 — 中文鍵或英文鍵
  if (raw["物品"]) {
    if (Array.isArray(raw["物品"]["獲得"]) && raw["物品"]["獲得"].length > 0) {
      result.new_items = raw["物品"]["獲得"];
    }
    if (Array.isArray(raw["物品"]["失去"]) && raw["物品"]["失去"].length > 0) {
      result.lost_items = raw["物品"]["失去"];
    }
  } else {
    if (Array.isArray(raw.new_items) && raw.new_items.length > 0) result.new_items = raw.new_items;
    if (Array.isArray(raw.lost_items) && raw.lost_items.length > 0) result.lost_items = raw.lost_items;
  }

  // 部屬 — 中文鍵或英文鍵
  if (raw["部屬"]) {
    if (Array.isArray(raw["部屬"]["新增"]) && raw["部屬"]["新增"].length > 0) {
      result.new_subordinates = raw["部屬"]["新增"];
    }
    if (Array.isArray(raw["部屬"]["失去"]) && raw["部屬"]["失去"].length > 0) {
      result.lost_subordinates = raw["部屬"]["失去"];
    }
  } else {
    if (Array.isArray(raw.new_subordinates) && raw.new_subordinates.length > 0) result.new_subordinates = raw.new_subordinates;
    if (Array.isArray(raw.lost_subordinates) && raw.lost_subordinates.length > 0) result.lost_subordinates = raw.lost_subordinates;
  }

  // 技能 — 中文鍵或英文鍵
  if (raw["技能"]) {
    if (Array.isArray(raw["技能"]["新增"]) && raw["技能"]["新增"].length > 0) {
      result.new_skills = raw["技能"]["新增"];
    }
  } else {
    if (Array.isArray(raw.new_skills) && raw.new_skills.length > 0) result.new_skills = raw.new_skills;
  }

  // 好感度 — 中文鍵或英文鍵
  if (raw["好感度"] && typeof raw["好感度"] === "object") {
    const changes: Record<string, number> = {};
    for (const [npc, val] of Object.entries(raw["好感度"])) {
      if (val && typeof val === "object" && "變化" in (val as Record<string, unknown>)) {
        const delta = Number((val as Record<string, unknown>)["變化"]) || 0;
        if (delta !== 0) changes[npc] = delta;
      } else if (typeof val === "number" && val !== 0) {
        changes[npc] = val;
      }
    }
    if (Object.keys(changes).length > 0) result.affection_changes = changes;
  } else if (raw.affection_changes && typeof raw.affection_changes === "object") {
    const changes: Record<string, number> = {};
    for (const [npc, val] of Object.entries(raw.affection_changes)) {
      const n = Number(val);
      if (n !== 0) changes[npc] = n;
    }
    if (Object.keys(changes).length > 0) result.affection_changes = changes;
  }

  // 檢查是否有任何有效變動
  const hasChanges =
    (result.silver_change && result.silver_change !== 0) ||
    result.new_items?.length ||
    result.lost_items?.length ||
    result.new_subordinates?.length ||
    result.lost_subordinates?.length ||
    result.new_skills?.length ||
    (result.affection_changes && Object.keys(result.affection_changes).length > 0);

  return hasChanges ? result : null;
}

/**
 * 從 AI 回覆中解析 GAME_DATA 區塊
 * 容錯：JSON 解析失敗時，仍回傳清理後的回覆
 */
export function parseGameData(response: string): ParseResult {
  const gameDataMatch = response.match(/\[GAME_DATA\]([\s\S]*?)\[\/GAME_DATA\]/);

  if (!gameDataMatch) {
    return { cleanResponse: response, gameData: null };
  }

  const cleanResponse = response.replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/, "").trim();

  try {
    const raw = JSON.parse(gameDataMatch[1].trim());
    const gameData = normalizeGameData(raw);
    return { cleanResponse, gameData };
  } catch (e) {
    console.error("GAME_DATA 解析失敗:", e);
    return { cleanResponse, gameData: null };
  }
}

/**
 * 更新玩家數據到資料庫（含重試）
 * fire-and-forget，失敗不影響遊戲流程
 */
export async function updatePlayerStats(
  sessionId: string,
  gameData: GameData,
  roundNumber: number
): Promise<boolean> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const supabase = getServiceClient();
      if (!supabase) {
        console.warn("updatePlayerStats: missing SUPABASE_SERVICE_ROLE_KEY");
        return false;
      }

      // 讀取現有數據
      const { data: existing } = await supabase
        .from("player_stats")
        .select("*")
        .eq("session_id", sessionId)
        .single();

      const currentSilver = existing?.silver ?? 0;
      const currentItems: string[] = existing?.items ?? [];
      const currentSubordinates: string[] = existing?.subordinates ?? [];
      const currentSkills: string[] = existing?.skills ?? [];
      const currentAffection: Record<string, number> = existing?.affection ?? {};

      // 計算新數據
      const newSilver = Math.max(0, currentSilver + (gameData.silver_change ?? 0));

      const newItems = [...currentItems];
      if (gameData.new_items) {
        for (const item of gameData.new_items) {
          if (!newItems.includes(item)) newItems.push(item);
        }
      }
      if (gameData.lost_items) {
        for (const item of gameData.lost_items) {
          const idx = newItems.indexOf(item);
          if (idx !== -1) newItems.splice(idx, 1);
        }
      }

      const newSubordinates = [...currentSubordinates];
      if (gameData.new_subordinates) {
        for (const sub of gameData.new_subordinates) {
          if (!newSubordinates.includes(sub)) newSubordinates.push(sub);
        }
      }
      if (gameData.lost_subordinates) {
        for (const sub of gameData.lost_subordinates) {
          const idx = newSubordinates.indexOf(sub);
          if (idx !== -1) newSubordinates.splice(idx, 1);
        }
      }

      const newSkills = [...currentSkills];
      if (gameData.new_skills) {
        for (const skill of gameData.new_skills) {
          if (!newSkills.includes(skill)) newSkills.push(skill);
        }
      }

      const newAffection = { ...currentAffection };
      if (gameData.affection_changes) {
        for (const [npc, delta] of Object.entries(gameData.affection_changes)) {
          newAffection[npc] = (newAffection[npc] ?? 0) + delta;
        }
      }

      // Upsert player_stats
      const { error: upsertError } = await supabase
        .from("player_stats")
        .upsert(
          {
            session_id: sessionId,
            silver: newSilver,
            items: newItems,
            subordinates: newSubordinates,
            skills: newSkills,
            affection: newAffection,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "session_id" }
        );

      if (upsertError) throw upsertError;

      // 寫入歷史紀錄
      const { error: historyError } = await supabase
        .from("player_stats_history")
        .insert({
          session_id: sessionId,
          round_number: roundNumber,
          game_data: gameData,
        });

      if (historyError) {
        console.warn("player_stats_history insert error:", historyError.message);
      }

      return true;
    } catch (e) {
      console.error(`更新數據失敗 (嘗試 ${attempt}/${maxRetries}):`, e);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  console.error("更新數據最終失敗，遊戲繼續");
  return false;
}
