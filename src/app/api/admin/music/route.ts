import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_SECRET = "GhostStory2026";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/music?secret=...&abnormal_only=true
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const abnormalOnly = request.nextUrl.searchParams.get("abnormal_only") === "true";

    // 取得最近 100 筆音樂切換紀錄
    let query = supabase
      .from("music_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (abnormalOnly) {
      query = query.eq("is_abnormal", true);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    // 批次取得 session → player 名稱
    const sessionIds = [...new Set((logs || []).map((l) => l.session_id).filter(Boolean))];
    let playerMap = new Map<string, string>();

    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("id, player_id")
        .in("id", sessionIds);

      const playerIds = [...new Set((sessions || []).map((s) => s.player_id))];
      if (playerIds.length > 0) {
        const { data: players } = await supabase
          .from("players")
          .select("id, name")
          .in("id", playerIds);

        const pidToName = new Map((players || []).map((p) => [p.id, p.name]));
        const sidToPid = new Map((sessions || []).map((s) => [s.id, s.player_id]));

        playerMap = new Map(
          sessionIds.map((sid) => [sid, pidToName.get(sidToPid.get(sid) || "") || "未知"])
        );
      }
    }

    // 統計
    const allLogs = logs || [];
    const abnormalCount = allLogs.filter((l) => l.is_abnormal).length;

    const enriched = allLogs.map((log) => ({
      ...log,
      player_name: playerMap.get(log.session_id) || "未知",
    }));

    // 取得玩家回報
    const { data: feedbackData } = await supabase
      .from("music_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    // 為回報附加玩家名稱
    const feedbackPlayerIds = [...new Set((feedbackData || []).map((f) => f.player_id).filter(Boolean))];
    let feedbackPlayerMap = new Map<string, string>();
    if (feedbackPlayerIds.length > 0) {
      const { data: fbPlayers } = await supabase.from("players").select("id, name").in("id", feedbackPlayerIds);
      feedbackPlayerMap = new Map((fbPlayers || []).map((p) => [p.id, p.name]));
    }
    const feedback = (feedbackData || []).map((f) => ({
      ...f,
      player_name: feedbackPlayerMap.get(f.player_id) || "未知",
    }));

    return NextResponse.json({
      logs: enriched,
      stats: {
        total: allLogs.length,
        abnormal: abnormalCount,
        normal: allLogs.length - abnormalCount,
      },
      feedback,
      feedbackCount: feedback.filter((f) => !f.is_resolved).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/music — 管理操作（標記回報已解決）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret, action, feedbackId } = body;

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const supabase = getSupabase();

    if (action === "resolve_feedback" && feedbackId) {
      await supabase.from("music_feedback").update({ is_resolved: true }).eq("id", feedbackId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "無效操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失敗" },
      { status: 500 }
    );
  }
}
