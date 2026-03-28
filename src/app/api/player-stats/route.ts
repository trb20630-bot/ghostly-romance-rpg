import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/player-stats?sessionId=xxx
 * 從資料庫讀取玩家數據（銀兩、物品、好感度），不呼叫 AI
 */
export async function GET(request: NextRequest) {
  try {
    const playerId = await authenticateOrFallback(request);
    if (!playerId) {
      return unauthorizedResponse();
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId");
    console.log(`[PLAYER_STATS] 請求 playerId=${playerId} sessionId=${sessionId}`);

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      console.log("[PLAYER_STATS] FAIL: Supabase client 建立失敗");
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
    }

    // 驗證 session 歸屬
    const { data: session, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("player_id")
      .eq("id", sessionId)
      .single();

    console.log(`[PLAYER_STATS] session 查詢: data=${JSON.stringify(session)} error=${sessionErr?.message ?? "none"}`);

    if (!session || session.player_id !== playerId) {
      console.log(`[PLAYER_STATS] 歸屬檢查失敗: session.player_id=${session?.player_id} != playerId=${playerId}`);
      return NextResponse.json({ error: "無權存取此存檔" }, { status: 403 });
    }

    // 讀取玩家數據
    const { data: stats, error: statsErr } = await supabase
      .from("player_stats")
      .select("silver, items, subordinates, skills, affection, updated_at")
      .eq("session_id", sessionId)
      .single();

    console.log(`[PLAYER_STATS] player_stats 查詢: data=${stats ? "有資料" : "null"} error=${statsErr?.message ?? "none"}`);

    if (!stats) {
      console.log(`[PLAYER_STATS] 回傳 exists=false (${statsErr?.code === "PGRST116" ? "表存在但無資料" : statsErr?.code ?? "unknown"})`);
      return NextResponse.json({
        silver: 0,
        items: [],
        subordinates: [],
        skills: [],
        affection: {},
        exists: false,
      });
    }

    console.log(`[PLAYER_STATS] 回傳 exists=true silver=${stats.silver} items=${JSON.stringify(stats.items)}`);
    return NextResponse.json({
      silver: stats.silver,
      items: stats.items,
      subordinates: stats.subordinates ?? [],
      skills: stats.skills ?? [],
      affection: stats.affection,
      updatedAt: stats.updated_at,
      exists: true,
    });
  } catch (error) {
    console.error("Player stats API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
