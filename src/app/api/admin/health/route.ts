import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ADMIN_SECRET = "GhostStory2026";
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 分鐘

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface SessionCheck {
  sessionId: string;
  playerId: string;
  playerName: string;
  character: string | null;
  roundNumber: number;
  phase: string;
  lastActive: string;
  isOnline: boolean;
  issues: SessionIssue[];
  healthy: boolean;
}

interface SessionIssue {
  type: "missing_round" | "unpaired" | "duplicate" | "memory_lost" | "memory_empty_facts" | "summary_stale";
  detail: string;
  severity: "error" | "warning";
}

// ===== GET: 只讀檢查 =====
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const now = Date.now();

    // 取得所有有對話的 session（含 last_active_at）
    const { data: sessions } = await supabase
      .from("game_sessions")
      .select("id, player_id, chosen_character, round_number, phase, updated_at, last_active_at")
      .gt("round_number", 0)
      .order("updated_at", { ascending: false });

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ results: [], summary: { total: 0, healthy: 0, unhealthy: 0, online: 0 } });
    }

    // 批次取得玩家名稱
    const playerIds = [...new Set(sessions.map((s) => s.player_id))];
    const { data: players } = await supabase
      .from("players")
      .select("id, name")
      .in("id", playerIds);

    const playerMap = new Map(
      (players || []).map((p) => [p.id, { name: p.name }])
    );

    const results: SessionCheck[] = [];

    for (const session of sessions) {
      const playerInfo = playerMap.get(session.player_id);
      // 優先用 session 的 last_active_at，其次 updated_at
      const lastActive = session.last_active_at || session.updated_at;
      const isOnline = (now - new Date(lastActive).getTime()) < ONLINE_THRESHOLD_MS;
      const issues: SessionIssue[] = [];

      // 1. 讀取對話紀錄（只讀）
      const { data: logs } = await supabase
        .from("conversation_logs")
        .select("round_number, role")
        .eq("session_id", session.id)
        .order("round_number", { ascending: true });

      const allLogs = logs || [];

      // 1a. 檢查重複
      const roundRoleCounts = new Map<string, number>();
      for (const log of allLogs) {
        const key = `${log.round_number}_${log.role}`;
        roundRoleCounts.set(key, (roundRoleCounts.get(key) || 0) + 1);
      }
      const duplicateRounds: number[] = [];
      for (const [key, count] of roundRoleCounts) {
        if (count > 1) {
          const round = parseInt(key.split("_")[0], 10);
          if (!duplicateRounds.includes(round)) duplicateRounds.push(round);
        }
      }
      if (duplicateRounds.length > 0) {
        issues.push({
          type: "duplicate",
          detail: `第 ${duplicateRounds.join(", ")} 輪有重複紀錄`,
          severity: "warning",
        });
      }

      // 1b. 檢查連續性
      const rounds = [...new Set(allLogs.map((l) => l.round_number))].sort((a, b) => a - b);
      if (rounds.length > 0) {
        const missing: number[] = [];
        for (let i = rounds[0]; i <= rounds[rounds.length - 1]; i++) {
          if (!rounds.includes(i)) missing.push(i);
        }
        if (missing.length > 0) {
          issues.push({
            type: "missing_round",
            detail: `第 ${missing.join(", ")} 輪遺漏`,
            severity: "error",
          });
        }
      }

      // 1c. 檢查配對
      const roundRoles = new Map<number, Set<string>>();
      for (const log of allLogs) {
        if (!roundRoles.has(log.round_number)) roundRoles.set(log.round_number, new Set());
        roundRoles.get(log.round_number)!.add(log.role);
      }
      const unpairedRounds: number[] = [];
      for (const [round, roles] of roundRoles) {
        if (!roles.has("user") || !roles.has("assistant")) {
          unpairedRounds.push(round);
        }
      }
      if (unpairedRounds.length > 0) {
        issues.push({
          type: "unpaired",
          detail: `第 ${unpairedRounds.join(", ")} 輪缺少 user 或 assistant`,
          severity: "warning",
        });
      }

      // 2. 檢查記憶（只讀）
      const { data: memory } = await supabase
        .from("player_memory")
        .select("key_facts, story_summaries, last_summarized_round")
        .eq("session_id", session.id)
        .maybeSingle();

      if (!memory) {
        issues.push({
          type: "memory_lost",
          detail: "player_memory 紀錄不存在",
          severity: "error",
        });
      } else {
        // 檢查 key_facts 是否全空
        const facts = memory.key_facts as Record<string, string[]> | null;
        if (facts) {
          const totalFacts = Object.values(facts).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
          if (totalFacts === 0 && session.round_number >= 10) {
            issues.push({
              type: "memory_empty_facts",
              detail: `已玩 ${session.round_number} 輪但 key_facts 全空`,
              severity: "warning",
            });
          }
        }

        // 檢查摘要是否過期
        const lastSummarized = (memory.last_summarized_round as number) || 0;
        if (session.round_number - lastSummarized > 15) {
          issues.push({
            type: "summary_stale",
            detail: `當前第 ${session.round_number} 輪，最後摘要在第 ${lastSummarized} 輪（落後 ${session.round_number - lastSummarized} 輪）`,
            severity: "warning",
          });
        }
      }

      results.push({
        sessionId: session.id,
        playerId: session.player_id,
        playerName: playerInfo?.name || "未知",
        character: session.chosen_character,
        roundNumber: session.round_number,
        phase: session.phase,
        lastActive: lastActive,
        isOnline,
        issues,
        healthy: issues.length === 0,
      });
    }

    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.healthy).length,
      unhealthy: results.filter((r) => !r.healthy).length,
      online: results.filter((r) => r.isOnline).length,
    };

    return NextResponse.json({ results, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "檢查失敗" },
      { status: 500 }
    );
  }
}

// ===== POST: 修復操作 =====
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret, action, sessionId } = body;

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const supabase = getSupabase();

    if (action === "repair") {
      if (!sessionId) {
        return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
      }

      // 安全檢查：用 session 的 last_active_at 確認玩家不在線
      const { data: session } = await supabase
        .from("game_sessions")
        .select("player_id, last_active_at, updated_at")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return NextResponse.json({ error: "找不到 session" }, { status: 404 });
      }

      const sessionLastActive = session.last_active_at || session.updated_at;
      if (sessionLastActive && (Date.now() - new Date(sessionLastActive).getTime()) < ONLINE_THRESHOLD_MS) {
        return NextResponse.json({
          error: "此玩家正在遊玩中，請稍後再修復",
          isOnline: true,
        }, { status: 409 });
      }

      // 步驟 1：備份原始資料
      const { data: backupLogs } = await supabase
        .from("conversation_logs")
        .select("*")
        .eq("session_id", sessionId);

      const { data: backupMemory } = await supabase
        .from("player_memory")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();

      // 記錄備份到 error_logs
      await supabase.from("error_logs").insert({
        player_id: session.player_id,
        session_id: sessionId,
        error_type: "repair_backup",
        error_detail: {
          backup_at: new Date().toISOString(),
          conversation_count: backupLogs?.length || 0,
          memory_snapshot: backupMemory || null,
        },
      });

      const repairs: string[] = [];

      // 步驟 2：刪除重複對話（保留最早的）
      if (backupLogs && backupLogs.length > 0) {
        const seen = new Map<string, string>(); // key -> earliest id
        const toDelete: string[] = [];

        // 按 created_at 排序找出最早的
        const sorted = [...backupLogs].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        for (const log of sorted) {
          const key = `${log.round_number}_${log.role}`;
          if (seen.has(key)) {
            toDelete.push(log.id);
          } else {
            seen.set(key, log.id);
          }
        }

        if (toDelete.length > 0) {
          await supabase
            .from("conversation_logs")
            .delete()
            .in("id", toDelete);
          repairs.push(`刪除 ${toDelete.length} 條重複對話`);
        }
      }

      // 步驟 3：修復記憶
      if (!backupMemory || !backupMemory.key_facts) {
        const defaultFacts = {
          enemies: [], allies: [], promises: [], secrets: [],
          kills: [], learned_skills: [], visited_places: [], important_items: [],
        };
        await supabase.from("player_memory").upsert(
          {
            session_id: sessionId,
            key_facts: defaultFacts,
            story_summaries: [],
            last_summarized_round: 0,
          },
          { onConflict: "session_id" }
        );
        repairs.push("初始化缺失的 player_memory");
      }

      // 記錄修復結果
      await supabase.from("error_logs").insert({
        player_id: session.player_id,
        session_id: sessionId,
        error_type: "repair_completed",
        error_detail: { repairs },
        resolved: true,
      });

      return NextResponse.json({ ok: true, repairs });
    }

    return NextResponse.json({ error: "無效操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "修復失敗" },
      { status: 500 }
    );
  }
}
