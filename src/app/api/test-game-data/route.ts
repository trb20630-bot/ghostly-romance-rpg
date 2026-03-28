import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updatePlayerStats, parseGameData } from "@/lib/game-data-parser";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * POST /api/test-game-data
 * 繞過 AI，直接測試 GAME_DATA 寫入 + 讀取 + 解析
 */
export async function POST(request: NextRequest) {
  const results: string[] = [];
  try {
    const { sessionId } = await request.json();
    results.push(`1. 收到 sessionId: ${sessionId}`);

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId", results }, { status: 400 });
    }

    // 檢查 Supabase 連線
    const supabase = getServiceClient();
    if (!supabase) {
      results.push("2. FAIL: Supabase client 建立失敗（缺少環境變數）");
      return NextResponse.json({ error: "Supabase 未設定", results }, { status: 500 });
    }
    results.push("2. OK: Supabase client 建立成功");

    // 檢查 session 是否存在
    const { data: session, error: sessionError } = await supabase
      .from("game_sessions")
      .select("id, player_id")
      .eq("id", sessionId)
      .single();

    if (sessionError) {
      results.push(`3. FAIL: game_sessions 查詢失敗: ${sessionError.message} (${sessionError.code})`);
      return NextResponse.json({ error: sessionError.message, results }, { status: 500 });
    }
    results.push(`3. OK: game_sessions 找到, player_id=${session.player_id}`);

    // 檢查 player_stats 表是否存在
    const { data: existingStats, error: statsError } = await supabase
      .from("player_stats")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (statsError) {
      results.push(`4. FAIL: player_stats 查詢失敗: ${statsError.message} (${statsError.code})`);
      results.push("   → 請到 Supabase SQL Editor 執行 011_player_stats.sql");
      return NextResponse.json({ error: statsError.message, results }, { status: 500 });
    }
    results.push(`4. OK: player_stats 表存在, 現有資料: ${existingStats ? JSON.stringify(existingStats) : "無"}`);

    // 測試解析器
    const testAiResponse = `測試故事內容。\n\n<!-- SCENE: LANRUO -->\n[GAME_DATA]\n[+物品] 測試寶劍\n[+物品] 測試護身符\n[+銀兩] 100 測試獎勵\n[+好感] 測試NPC 5 測試\n[/GAME_DATA]`;
    const { gameData: parsedData } = parseGameData(testAiResponse);
    results.push(`5. 解析器測試: ${parsedData ? JSON.stringify(parsedData) : "FAIL: 解析失敗"}`);

    if (!parsedData) {
      return NextResponse.json({ error: "解析器失敗", results }, { status: 500 });
    }

    // 直接寫入
    results.push("6. 開始寫入 DB...");
    const writeResult = await updatePlayerStats(sessionId, parsedData, 999);
    if (writeResult.ok) {
      results.push("6. OK: updatePlayerStats 成功");
    } else {
      results.push(`6. FAIL: updatePlayerStats 失敗`);
      results.push(`   錯誤: ${writeResult.error}`);

      // 降級方案：直接用 raw insert 測試
      results.push("6b. 嘗試直接 raw insert...");
      const { error: rawError } = await supabase
        .from("player_stats")
        .insert({
          session_id: sessionId,
          silver: 100,
          items: ["raw測試劍"],
          subordinates: [],
          skills: [],
          affection: {},
          updated_at: new Date().toISOString(),
        });
      if (rawError) {
        results.push(`6b. FAIL: raw insert 也失敗: ${rawError.message} (code: ${rawError.code}, details: ${rawError.details}, hint: ${rawError.hint})`);
      } else {
        results.push("6b. OK: raw insert 成功（問題在 updatePlayerStats 邏輯而非 DB）");
      }

      return NextResponse.json({ error: "DB 寫入失敗", results }, { status: 500 });
    }

    // 重新讀取驗證
    const { data: afterStats, error: afterError } = await supabase
      .from("player_stats")
      .select("silver, items, subordinates, skills, affection")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (afterError) {
      results.push(`7. FAIL: 寫入後讀取失敗: ${afterError.message}`);
    } else if (afterStats) {
      results.push(`7. OK: silver=${afterStats.silver}, items=${JSON.stringify(afterStats.items)}, affection=${JSON.stringify(afterStats.affection)}`);
    } else {
      results.push("7. FAIL: 寫入後讀取不到資料");
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    results.push(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: "測試失敗", results }, { status: 500 });
  }
}
