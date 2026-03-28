import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callClaude } from "@/lib/claude";
import { parseTagLines, updatePlayerStats } from "@/lib/game-data-parser";
import type { ParsedGameData } from "@/lib/game-data-parser";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const BACKFILL_PROMPT = `你是遊戲數據分析助手。分析以下古風 RPG 遊戲對話，找出玩家的狀態變化。

用以下標記格式回覆（每行一個變化）：
[+物品] 物品名
[-物品] 失去的物品名
[+銀兩] 數量 原因
[-銀兩] 數量 原因
[+好感] NPC名 數值
[-好感] NPC名 數值
[+部屬] 人名
[-部屬] 人名
[+技能] 技能名

判斷規則：
- 物品：玩家實際拿起/購買/收下的才算，場景描述中的不算
- 部屬：NPC 明確同意追隨才算，只是合作不算
- 技能：已完成/學會才算，正在研究不算
- 好感：有明確情感事件才算，普通對話不算
- 必須是已發生的事實，不是意圖

如果完全沒有任何變化，只回覆：無變化`;

const BATCH_SIZE = 5; // 每批分析 5 輪

/**
 * POST /api/backfill-stats
 * 讀取歷史 conversation_logs，用 Haiku 分析，補齊 player_stats
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) return unauthorizedResponse();

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase 未設定" }, { status: 500 });
    }

    // 驗證 session 歸屬
    const { data: session } = await supabase
      .from("game_sessions")
      .select("player_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.player_id !== playerId) {
      return NextResponse.json({ error: "無權存取此存檔" }, { status: 403 });
    }

    // 讀取所有 assistant 回覆
    const { data: logs, error: logsError } = await supabase
      .from("conversation_logs")
      .select("round_number, content")
      .eq("session_id", sessionId)
      .eq("role", "assistant")
      .order("round_number", { ascending: true });

    if (logsError) {
      return NextResponse.json({ error: `讀取對話失敗: ${logsError.message}` }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({ error: "沒有找到任何對話記錄" }, { status: 404 });
    }

    const totalRounds = logs.length;
    const batches: Array<{ rounds: string; text: string }> = [];

    // 分批打包
    for (let i = 0; i < logs.length; i += BATCH_SIZE) {
      const batch = logs.slice(i, i + BATCH_SIZE);
      const roundRange = `${batch[0].round_number}-${batch[batch.length - 1].round_number}`;
      const text = batch
        .map((log) => `【第${log.round_number}輪】\n${log.content}`)
        .join("\n\n---\n\n");
      batches.push({ rounds: roundRange, text });
    }

    // 用 Haiku 逐批分析
    const accumulated: ParsedGameData = {
      items: { add: [], remove: [] },
      silver: 0,
      relationships: {},
      followers: { add: [], remove: [] },
      skills: [],
    };

    const batchResults: string[] = [];
    let analyzedRounds = 0;

    for (const batch of batches) {
      try {
        const result = await callClaude(
          BACKFILL_PROMPT,
          [{ role: "user", content: batch.text }],
          "haiku",
          1000
        );

        const reply = result.text.trim();
        if (reply !== "無變化") {
          const before = JSON.stringify(accumulated);
          parseTagLines(reply, accumulated);
          const after = JSON.stringify(accumulated);
          const changed = before !== after;
          batchResults.push(`輪 ${batch.rounds}: ${changed ? "有解析到變化" : "Haiku有回覆但正則未匹配"}`);
          batchResults.push(`  Haiku原始回覆: ${reply.slice(0, 300)}`);
        } else {
          batchResults.push(`輪 ${batch.rounds}: 無變化`);
        }

        analyzedRounds += BATCH_SIZE;
      } catch (e) {
        batchResults.push(`輪 ${batch.rounds}: 分析失敗 (${e instanceof Error ? e.message : "unknown"})`);
      }
    }

    // 計算最終累加結果
    // items: add 去重, remove 從 add 中移除
    const finalItems: string[] = [];
    for (const item of accumulated.items.add) {
      if (!finalItems.includes(item)) finalItems.push(item);
    }
    for (const item of accumulated.items.remove) {
      const idx = finalItems.indexOf(item);
      if (idx !== -1) finalItems.splice(idx, 1);
    }

    const finalFollowers: string[] = [];
    for (const f of accumulated.followers.add) {
      if (!finalFollowers.includes(f)) finalFollowers.push(f);
    }
    for (const f of accumulated.followers.remove) {
      const idx = finalFollowers.indexOf(f);
      if (idx !== -1) finalFollowers.splice(idx, 1);
    }

    const finalSkills: string[] = [];
    for (const s of accumulated.skills) {
      if (!finalSkills.includes(s)) finalSkills.push(s);
    }

    // 寫入 player_stats（直接覆蓋，因為是補齊歷史）
    const finalData: ParsedGameData = {
      items: { add: finalItems, remove: [] },
      silver: accumulated.silver,
      relationships: accumulated.relationships,
      followers: { add: finalFollowers, remove: [] },
      skills: finalSkills,
    };

    const writeResult = await updatePlayerStats(sessionId, finalData, totalRounds);

    return NextResponse.json({
      success: writeResult.ok,
      totalRounds,
      batchesAnalyzed: batches.length,
      batchResults,
      finalStats: {
        silver: accumulated.silver,
        items: finalItems,
        followers: finalFollowers,
        skills: finalSkills,
        relationships: accumulated.relationships,
      },
      writeError: writeResult.error,
    });
  } catch (error) {
    console.error("Backfill API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
