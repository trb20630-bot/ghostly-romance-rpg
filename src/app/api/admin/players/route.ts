import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }

  const queryToken = request.nextUrl.searchParams.get("secret");
  if (queryToken !== adminSecret) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Query players — try with last_active, fallback without it
    let playersRes = await supabase.from("players").select("*").order("created_at", { ascending: false });
    if (playersRes.error) {
      playersRes = await supabase.from("players").select("id, name, created_at").order("created_at", { ascending: false });
    }

    const sessionsRes = await supabase
      .from("game_sessions")
      .select("id, player_id, slot_number, chosen_character, player_occupation, phase, round_number, current_location, updated_at, last_active_at")
      .order("slot_number", { ascending: true });

    const players = playersRes.data || [];
    const sessions = sessionsRes.data || [];

    // Group sessions by player
    const sessionsByPlayer: Record<string, typeof sessions> = {};
    for (const s of sessions) {
      if (!sessionsByPlayer[s.player_id]) sessionsByPlayer[s.player_id] = [];
      sessionsByPlayer[s.player_id].push(s);
    }

    // 用 session 的 last_active_at 判斷在線（比 players.last_active 更準確）
    const playerList = players.map((p: Record<string, unknown>) => {
      const pSessions = sessionsByPlayer[p.id as string] || [];
      // 優先用 session 的 last_active_at，其次 updated_at，最後 players.last_active
      const sessionTimes = pSessions
        .map((s: Record<string, unknown>) => (s.last_active_at as string) || (s.updated_at as string))
        .filter(Boolean);
      const latestSessionTime = sessionTimes.length > 0
        ? sessionTimes.reduce((a: string, b: string) => a > b ? a : b)
        : null;
      return {
        player_id: p.id,
        player_name: p.name || "未命名",
        last_active: latestSessionTime || (p.last_active as string) || null,
        created_at: p.created_at,
        sessions: pSessions,
      };
    });

    // Stats
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const onlineCount = playerList.filter((p) => p.last_active && p.last_active > fiveMinAgo).length;
    const completedCount = sessions.filter((s) => s.phase === "ending" || s.phase === "export").length;
    const activeSessions = sessions.filter((s) => s.round_number > 0);
    const avgRound = activeSessions.length > 0
      ? activeSessions.reduce((sum, s) => sum + s.round_number, 0) / activeSessions.length
      : 0;

    return NextResponse.json({
      players: playerList,
      stats: {
        total_players: players.length,
        online_players: onlineCount,
        total_sessions: sessions.length,
        completed_sessions: completedCount,
        avg_round_number: avgRound,
      },
    });
  } catch (error) {
    console.error("Admin players API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查詢失敗", details: String(error) },
      { status: 500 }
    );
  }
}
