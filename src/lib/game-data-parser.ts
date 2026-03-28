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
  relationships: Record<string, number>;
  followers: { add: string[]; remove: string[] };
  skills: string[];
}

export interface ParseResult {
  cleanResponse: string;
  gameData: ParsedGameData | null;
}

/**
 * 逐行解析標記格式文字，累加到 result 中
 * 可被 parseGameData 和 backfill 共用
 */
export function parseTagLines(text: string, result: ParsedGameData): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let m: RegExpMatchArray | null;

    m = trimmed.match(/^\[\+物品\]\s*(.+)$/);
    if (m) { result.items.add.push(m[1].trim()); continue; }

    m = trimmed.match(/^\[-物品\]\s*(.+)$/);
    if (m) { result.items.remove.push(m[1].trim()); continue; }

    m = trimmed.match(/^\[\+銀兩\]\s*(\d+)/);
    if (m) { result.silver += parseInt(m[1]); continue; }

    m = trimmed.match(/^\[-銀兩\]\s*(\d+)/);
    if (m) { result.silver -= parseInt(m[1]); continue; }

    m = trimmed.match(/^\[\+好感\]\s*(\S+)\s+(\d+)/);
    if (m) { result.relationships[m[1]] = (result.relationships[m[1]] || 0) + parseInt(m[2]); continue; }

    m = trimmed.match(/^\[-好感\]\s*(\S+)\s+(\d+)/);
    if (m) { result.relationships[m[1]] = (result.relationships[m[1]] || 0) - parseInt(m[2]); continue; }

    m = trimmed.match(/^\[\+部屬\]\s*(\S+)/);
    if (m) { result.followers.add.push(m[1]); continue; }

    m = trimmed.match(/^\[-部屬\]\s*(\S+)/);
    if (m) { result.followers.remove.push(m[1]); continue; }

    m = trimmed.match(/^\[\+技能\]\s*(.+)$/);
    if (m) { result.skills.push(m[1].trim()); continue; }
  }
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
    relationships: {},
    followers: { add: [], remove: [] },
    skills: [],
  };

  parseTagLines(content, result);


  console.log(`[PARSER] 解析結果: ${JSON.stringify(result)}`);

  const hasChanges =
    result.items.add.length > 0 ||
    result.items.remove.length > 0 ||
    result.silver !== 0 ||
    Object.keys(result.relationships).length > 0 ||
    result.followers.add.length > 0 ||
    result.followers.remove.length > 0 ||
    result.skills.length > 0;

  return { cleanResponse, gameData: hasChanges ? result : null };
}

/**
 * 更新玩家數據到資料庫
 *
 * DB 欄位對應：
 *   silver      INTEGER
 *   items       JSONB (string[])
 *   followers JSONB (string[])
 *   skills      JSONB (string[])
 *   relationships   JSONB (Record<string, number>)
 */
export async function updatePlayerStats(
  sessionId: string,
  gameData: ParsedGameData,
  roundNumber: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getServiceClient();
    if (!supabase) {
      const msg = "Supabase client 建立失敗（缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY）";
      console.error(`[DB_WRITE] ${msg}`);
      return { ok: false, error: msg };
    }

    // 讀取現有數據（maybeSingle 不會在無資料時拋錯）
    const { data: existing, error: readError } = await supabase
      .from("player_stats")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (readError) {
      const msg = `讀取 player_stats 失敗: ${readError.message} (code: ${readError.code}, details: ${readError.details}, hint: ${readError.hint})`;
      console.error(`[DB_WRITE] ${msg}`);
      return { ok: false, error: msg };
    }

    console.log(`[DB_WRITE] 現有資料: ${existing ? "有" : "無"}`);

    // 計算新數據
    const currentSilver: number = existing?.silver ?? 0;
    const currentItems: string[] = existing?.items ?? [];
    const currentSubordinates: string[] = existing?.followers ?? [];
    const currentSkills: string[] = existing?.skills ?? [];
    const currentAffection: Record<string, number> = existing?.relationships ?? {};

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
    for (const sub of gameData.followers.add) {
      if (!newSubordinates.includes(sub)) newSubordinates.push(sub);
    }
    for (const sub of gameData.followers.remove) {
      const idx = newSubordinates.indexOf(sub);
      if (idx !== -1) newSubordinates.splice(idx, 1);
    }

    const newSkills = [...currentSkills];
    for (const skill of gameData.skills) {
      if (!newSkills.includes(skill)) newSkills.push(skill);
    }

    const newAffection = { ...currentAffection };
    for (const [npc, delta] of Object.entries(gameData.relationships)) {
      newAffection[npc] = (newAffection[npc] ?? 0) + delta;
    }

    // 寫入（用 update 或 insert，不用 upsert 以避免潛在問題）
    const payload = {
      session_id: sessionId,
      silver: newSilver,
      items: newItems,
      followers: newSubordinates,
      skills: newSkills,
      relationships: newAffection,
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
      const msg = `寫入 player_stats 失敗: ${writeError.message} (code: ${writeError.code}, details: ${writeError.details}, hint: ${writeError.hint})`;
      console.error(`[DB_WRITE] ${msg}`);
      return { ok: false, error: msg };
    }

    console.log("[DB_WRITE] 寫入成功");

    // 記錄歷史（fire-and-forget）
    void supabase.from("player_stats_history").insert({
      session_id: sessionId,
      round_number: roundNumber,
      game_data: gameData,
    });

    return { ok: true };
  } catch (error) {
    const msg = `例外: ${error instanceof Error ? `${error.message}\n${error.stack}` : String(error)}`;
    console.error(`[DB_WRITE] ${msg}`);
    return { ok: false, error: msg };
  }
}
