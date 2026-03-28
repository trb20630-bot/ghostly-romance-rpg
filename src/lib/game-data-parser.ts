/**
 * GAME_DATA 解析器 + 玩家數據更新
 * 使用簡單標記格式（每行一個變化），不再使用 JSON
 *
 * 格式範例：
 * [GAME_DATA]
 * [+物品] 蠟燭
 * [-銀兩] 30 買包子
 * [+好感] 聶小倩 10 救命之恩
 * [/GAME_DATA]
 */

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** 解析後的遊戲數據 */
export interface ParsedGameData {
  items: { add: string[]; remove: string[] };
  silver: number;
  affection: Record<string, number>;
  subordinates: { add: string[]; remove: string[] };
  skills: string[];
}

export interface ParseResult {
  cleanResponse: string;
  gameData: ParsedGameData | null;
}

/**
 * 從 AI 回覆中解析 [GAME_DATA] 區塊（簡單標記格式）
 */
export function parseGameData(response: string): ParseResult {
  console.log(`[PARSER] 輸入長度: ${response.length}`);

  const match = response.match(/\[GAME_DATA\]([\s\S]*?)\[\/GAME_DATA\]/);
  console.log(`[PARSER] 正則匹配: ${match ? "找到" : "未找到"}`);

  if (!match) {
    return { cleanResponse: response, gameData: null };
  }

  const content = match[1];
  const cleanResponse = response.replace(/\[GAME_DATA\][\s\S]*?\[\/GAME_DATA\]/, "").trim();

  const result: ParsedGameData = {
    items: { add: [], remove: [] },
    silver: 0,
    affection: {},
    subordinates: { add: [], remove: [] },
    skills: [],
  };

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let m: RegExpMatchArray | null;

    // [+物品] 蠟燭
    m = trimmed.match(/^\[\+物品\]\s*(.+)$/);
    if (m) { result.items.add.push(m[1].trim()); continue; }

    // [-物品] 火折子
    m = trimmed.match(/^\[-物品\]\s*(.+)$/);
    if (m) { result.items.remove.push(m[1].trim()); continue; }

    // [+銀兩] 50 賣藥材
    m = trimmed.match(/^\[\+銀兩\]\s*(\d+)/);
    if (m) { result.silver += parseInt(m[1]); continue; }

    // [-銀兩] 30 買包子
    m = trimmed.match(/^\[-銀兩\]\s*(\d+)/);
    if (m) { result.silver -= parseInt(m[1]); continue; }

    // [+好感] 聶小倩 10 救命之恩
    m = trimmed.match(/^\[\+好感\]\s*(\S+)\s+(\d+)/);
    if (m) {
      result.affection[m[1]] = (result.affection[m[1]] || 0) + parseInt(m[2]);
      continue;
    }

    // [-好感] 姥姥 5 拒絕
    m = trimmed.match(/^\[-好感\]\s*(\S+)\s+(\d+)/);
    if (m) {
      result.affection[m[1]] = (result.affection[m[1]] || 0) - parseInt(m[2]);
      continue;
    }

    // [+部屬] 王二 被武功折服
    m = trimmed.match(/^\[\+部屬\]\s*(\S+)/);
    if (m) { result.subordinates.add.push(m[1]); continue; }

    // [-部屬] 王二
    m = trimmed.match(/^\[-部屬\]\s*(\S+)/);
    if (m) { result.subordinates.remove.push(m[1]); continue; }

    // [+技能] 交流電系統
    m = trimmed.match(/^\[\+技能\]\s*(.+)$/);
    if (m) { result.skills.push(m[1].trim()); continue; }

    // 忽略無法解析的行（可能是空行或其他格式）
    if (trimmed.startsWith("[")) {
      console.log(`[PARSER] 無法解析: ${trimmed}`);
    }
  }

  console.log(`[PARSER] 解析結果: ${JSON.stringify(result)}`);

  const hasChanges =
    result.items.add.length > 0 ||
    result.items.remove.length > 0 ||
    result.silver !== 0 ||
    Object.keys(result.affection).length > 0 ||
    result.subordinates.add.length > 0 ||
    result.subordinates.remove.length > 0 ||
    result.skills.length > 0;

  return { cleanResponse, gameData: hasChanges ? result : null };
}

/**
 * 更新玩家數據到資料庫
 *
 * DB 欄位對應：
 *   silver      INTEGER
 *   items       JSONB (string[])
 *   subordinates JSONB (string[])
 *   skills      JSONB (string[])
 *   affection   JSONB (Record<string, number>)
 */
export async function updatePlayerStats(
  sessionId: string,
  gameData: ParsedGameData,
  roundNumber: number
): Promise<boolean> {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      console.error("[DB_WRITE] Supabase client 建立失敗（缺少環境變數）");
      return false;
    }

    // 讀取現有數據（maybeSingle 不會在無資料時拋錯）
    const { data: existing, error: readError } = await supabase
      .from("player_stats")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (readError) {
      console.error(`[DB_WRITE] 讀取失敗: ${readError.message} (${readError.code})`);
      return false;
    }

    console.log(`[DB_WRITE] 現有資料: ${existing ? "有" : "無"}`);

    // 計算新數據
    const currentSilver: number = existing?.silver ?? 0;
    const currentItems: string[] = existing?.items ?? [];
    const currentSubordinates: string[] = existing?.subordinates ?? [];
    const currentSkills: string[] = existing?.skills ?? [];
    const currentAffection: Record<string, number> = existing?.affection ?? {};

    const newSilver = Math.max(0, currentSilver + gameData.silver);

    const newItems = [...currentItems];
    for (const item of gameData.items.add) {
      if (!newItems.includes(item)) newItems.push(item);
    }
    for (const item of gameData.items.remove) {
      const idx = newItems.indexOf(item);
      if (idx !== -1) newItems.splice(idx, 1);
    }

    const newSubordinates = [...currentSubordinates];
    for (const sub of gameData.subordinates.add) {
      if (!newSubordinates.includes(sub)) newSubordinates.push(sub);
    }
    for (const sub of gameData.subordinates.remove) {
      const idx = newSubordinates.indexOf(sub);
      if (idx !== -1) newSubordinates.splice(idx, 1);
    }

    const newSkills = [...currentSkills];
    for (const skill of gameData.skills) {
      if (!newSkills.includes(skill)) newSkills.push(skill);
    }

    const newAffection = { ...currentAffection };
    for (const [npc, delta] of Object.entries(gameData.affection)) {
      newAffection[npc] = (newAffection[npc] ?? 0) + delta;
    }

    // 寫入（用 update 或 insert，不用 upsert 以避免潛在問題）
    const payload = {
      session_id: sessionId,
      silver: newSilver,
      items: newItems,
      subordinates: newSubordinates,
      skills: newSkills,
      affection: newAffection,
      updated_at: new Date().toISOString(),
    };

    console.log(`[DB_WRITE] 寫入 payload: ${JSON.stringify(payload)}`);

    let writeError;
    if (existing) {
      const { error } = await supabase
        .from("player_stats")
        .update(payload)
        .eq("session_id", sessionId);
      writeError = error;
    } else {
      const { error } = await supabase
        .from("player_stats")
        .insert(payload);
      writeError = error;
    }

    if (writeError) {
      console.error(`[DB_WRITE] 寫入失敗: ${writeError.message} (${writeError.code})`);
      return false;
    }

    console.log("[DB_WRITE] 寫入成功");

    // 記錄歷史（fire-and-forget）
    void supabase.from("player_stats_history").insert({
      session_id: sessionId,
      round_number: roundNumber,
      game_data: gameData,
    });

    return true;
  } catch (error) {
    console.error(`[DB_WRITE] 例外: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
