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
    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
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

    // 讀取玩家數據
    const { data: stats } = await supabase
      .from("player_stats")
      .select("silver, items, subordinates, skills, affection, updated_at")
      .eq("session_id", sessionId)
      .single();

    if (!stats) {
      return NextResponse.json({
        silver: 0,
        items: [],
        subordinates: [],
        skills: [],
        affection: {},
        exists: false,
      });
    }

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
