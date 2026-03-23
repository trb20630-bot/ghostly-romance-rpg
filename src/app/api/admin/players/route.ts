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
    // Query players — use select(*) to handle varying schemas
    const playersRes = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });

    if (playersRes.error) {
      console.error("Players query error:", playersRes.error);
      return NextResponse.json({ error: "查詢玩家失敗: " + playersRes.error.message }, { status: 500 });
    }

    // Query sessions — use select(*) to avoid column-not-found errors
    // (last_active_at may not exist if migration 007 hasn't been applied)
    const sessionsRes = await supabase
      .from("game_sessions")
      .select("*")
      .order("slot_number", { ascending: true });

    if (sessionsRes.error) {
      console.error("Sessions query error:", sessionsRes.error);
      return NextResponse.json({ error: "查詢角色失敗: " + sessionsRes.error.message }, { status: 500 });
    }

    const players = playersRes.data || [];
    const sessions = sessionsRes.data || [];

    // Group sessions by player
    const sessionsByPlayer: Record<string, typeof sessions> = {};
    for (const s of sessions) {
      const pid = s.player_id as string;
      if (!pid) continue;
      if (!sessionsByPlayer[pid]) sessionsByPlayer[pid] = [];
      sessionsByPlayer[pid].push(s);
    }

    // Build player list with last_active from sessions
    const playerList = players.map((p: Record<string, unknown>) => {
      const pId = p.id as string;
      const pSessions = sessionsByPlayer[pId] || [];

      // Determine last activity: check session timestamps
      // Try last_active_at (migration 007), fallback to updated_at, fallback to player's last_active
      const sessionTimes = pSessions
        .map((s: Record<string, unknown>) =>
          (s.last_active_at as string) || (s.updated_at as string) || null
        )
        .filter(Boolean) as string[];

      const latestSessionTime = sessionTimes.length > 0
        ? sessionTimes.reduce((a, b) => a > b ? a : b)
        : null;

      // Fallback chain: session time > player's last_active > null
      const lastActive = latestSessionTime || (p.last_active as string) || null;

      return {
        player_id: pId,
        player_name: (p.name as string) || "未命名",
        last_active: lastActive,
        created_at: p.created_at as string,
        sessions: pSessions.map((s: Record<string, unknown>) => ({
          id: s.id,
          player_id: s.player_id,
          slot_number: s.slot_number,
          chosen_character: s.chosen_character || null,
          character_name: s.character_name || null,
          player_occupation: s.player_occupation || null,
          phase: s.phase || "setup",
          round_number: (s.round_number as number) || 0,
          current_location: s.current_location || "未知",
          updated_at: s.updated_at || s.created_at || null,
          last_active_at: s.last_active_at || null,
        })),
      };
    });

    // Stats
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const onlineCount = playerList.filter((p) => p.last_active && p.last_active > fiveMinAgo).length;
    const completedCount = sessions.filter((s) => s.phase === "ending" || s.phase === "export").length;
    const activeSessions = sessions.filter((s) => (s.round_number as number) > 0);
    const avgRound = activeSessions.length > 0
      ? activeSessions.reduce((sum, s) => sum + (s.round_number as number), 0) / activeSessions.length
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
