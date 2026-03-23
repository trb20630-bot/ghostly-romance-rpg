/**
 * Context Guard — 對話完整性檢查 + 自動修復 + 錯誤記錄
 * 防止上下文不對齊問題再次發生
 */

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ConversationLog {
  round_number: number;
  role: string;
  content: string;
  phase: string;
}

interface ValidationResult {
  valid: boolean;
  repaired: boolean;
  issues: string[];
  conversations: ConversationLog[];
  memory: {
    key_facts: Record<string, string[]>;
    story_summaries: string[];
    last_summarized_round: number;
  } | null;
}

// ===== 錯誤記錄 =====

async function logError(
  playerId: string | null,
  sessionId: string | null,
  errorType: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.from("error_logs").insert({
      player_id: playerId,
      session_id: sessionId,
      error_type: errorType,
      error_detail: detail,
    });
  } catch {
    console.error("Failed to log error:", errorType, detail);
  }
}

// ===== 一、對話完整性檢查 =====

function findMissingRounds(logs: ConversationLog[]): number[] {
  if (logs.length === 0) return [];
  const rounds = [...new Set(logs.map((l) => l.round_number))].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let i = rounds[0]; i <= rounds[rounds.length - 1]; i++) {
    if (!rounds.includes(i)) missing.push(i);
  }
  return missing;
}

function findUnpairedRounds(logs: ConversationLog[]): number[] {
  const roundMap = new Map<number, Set<string>>();
  for (const log of logs) {
    if (!roundMap.has(log.round_number)) roundMap.set(log.round_number, new Set());
    roundMap.get(log.round_number)!.add(log.role);
  }
  const unpaired: number[] = [];
  for (const [round, roles] of roundMap) {
    if (!roles.has("user") || !roles.has("assistant")) {
      unpaired.push(round);
    }
  }
  return unpaired;
}

function deduplicateLogs(logs: ConversationLog[]): ConversationLog[] {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${log.round_number}_${log.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ===== 二、自動修復機制 =====

export async function validateAndRepairContext(
  sessionId: string,
  playerId: string | null
): Promise<ValidationResult> {
  const supabase = getSupabase();
  const issues: string[] = [];
  let repaired = false;

  // 1. 讀取對話紀錄
  const { data: rawLogs } = await supabase
    .from("conversation_logs")
    .select("round_number, role, content, phase")
    .eq("session_id", sessionId)
    .order("round_number", { ascending: true })
    .order("created_at", { ascending: true });

  let logs = rawLogs || [];

  // 1a. 去重
  const beforeCount = logs.length;
  logs = deduplicateLogs(logs);
  if (logs.length < beforeCount) {
    const dupeCount = beforeCount - logs.length;
    issues.push(`去重：移除 ${dupeCount} 條重複對話`);
    void logError(playerId, sessionId, "duplicate_message", { duplicates_removed: dupeCount });
    repaired = true;
  }

  // 1b. 檢查對話連續性
  const missingRounds = findMissingRounds(logs);
  if (missingRounds.length > 0) {
    issues.push(`發現跳號：第 ${missingRounds.join(",")} 輪遺漏`);
    void logError(playerId, sessionId, "missing_round", { missing_rounds: missingRounds });
    // 不阻斷，用現有對話繼續
  }

  // 1c. 檢查對話配對
  const unpairedRounds = findUnpairedRounds(logs);
  if (unpairedRounds.length > 0) {
    issues.push(`配對異常：第 ${unpairedRounds.join(",")} 輪缺少 user 或 assistant`);
    void logError(playerId, sessionId, "unpaired_message", { unpaired_rounds: unpairedRounds });
  }

  // 2. 檢查記憶是否存在
  const { data: memoryData } = await supabase
    .from("player_memory")
    .select("key_facts, story_summaries, last_summarized_round")
    .eq("session_id", sessionId)
    .maybeSingle();

  let memory = memoryData;

  if (!memory || !memory.key_facts) {
    issues.push("記憶不存在或損壞，重建中");
    void logError(playerId, sessionId, "memory_lost", { had_memory: !!memory });

    // 從對話重建記憶 — 初始化空記憶
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
    memory = { key_facts: defaultFacts, story_summaries: [], last_summarized_round: 0 };
    repaired = true;
  }

  // 3. 檢查摘要是否過期
  const totalRounds = logs.length > 0
    ? Math.max(...logs.map((l) => l.round_number))
    : 0;
  const lastSummarized = (memory.last_summarized_round as number) || 0;

  if (totalRounds - lastSummarized > 15) {
    issues.push(`摘要過期：當前第 ${totalRounds} 輪，最後摘要在第 ${lastSummarized} 輪`);
    void logError(playerId, sessionId, "summary_stale", {
      current_round: totalRounds,
      last_summarized: lastSummarized,
      gap: totalRounds - lastSummarized,
    });
    // 標記需要強制摘要（由前端觸發，避免在此阻斷）
  }

  return {
    valid: issues.length === 0,
    repaired,
    issues,
    conversations: logs,
    memory: memory ? {
      key_facts: memory.key_facts as Record<string, string[]>,
      story_summaries: (memory.story_summaries as string[]) || [],
      last_summarized_round: (memory.last_summarized_round as number) || 0,
    } : null,
  };
}

// ===== 四、Context 組合前驗證 =====

interface ValidatedContext {
  recentHistory: Array<{ role: "user" | "assistant"; content: string }>;
  keyFacts: Record<string, string[]>;
  summaries: string[];
}

export function validateContextBeforeAI(
  recentHistory: Array<{ role: string; content: string }>,
  memory: { keyFacts?: Record<string, string[]> | { [K: string]: string[] }; storySummaries?: string[] } | null
): ValidatedContext {
  // 驗證 1：去重（用 content hash）
  const seen = new Set<string>();
  const uniqueHistory = recentHistory.filter((msg) => {
    const key = `${msg.role}:${msg.content.slice(0, 100)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 驗證 2：確保 user/assistant 交替（修正亂序）
  const sortedHistory = uniqueHistory.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // 驗證 3：key_facts 必須是物件
  const defaultFacts: Record<string, string[]> = {
    enemies: [], allies: [], promises: [], secrets: [],
    kills: [], learned_skills: [], visited_places: [], important_items: [],
  };
  const keyFacts = memory?.keyFacts && typeof memory.keyFacts === "object"
    ? memory.keyFacts
    : defaultFacts;

  // 驗證 4：summaries 必須是陣列
  const summaries = Array.isArray(memory?.storySummaries)
    ? memory.storySummaries
    : [];

  return { recentHistory: sortedHistory, keyFacts, summaries };
}

// ===== 六、健康檢查（供 admin API 使用）=====

export async function healthCheckSession(
  sessionId: string,
  playerId: string | null
): Promise<{ healthy: boolean; issues: string[] }> {
  const result = await validateAndRepairContext(sessionId, playerId);
  return {
    healthy: result.valid,
    issues: result.issues,
  };
}

export async function dailyHealthCheck(): Promise<{
  checked: number;
  unhealthy: number;
  details: Array<{ sessionId: string; playerId: string; issues: string[] }>;
}> {
  const supabase = getSupabase();

  // 找出過去 24 小時有更新的 session
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: activeSessions } = await supabase
    .from("game_sessions")
    .select("id, player_id")
    .gte("updated_at", since);

  const details: Array<{ sessionId: string; playerId: string; issues: string[] }> = [];

  for (const session of activeSessions || []) {
    const result = await healthCheckSession(session.id, session.player_id);
    if (!result.healthy) {
      details.push({
        sessionId: session.id,
        playerId: session.player_id,
        issues: result.issues,
      });
    }
  }

  return {
    checked: activeSessions?.length || 0,
    unhealthy: details.length,
    details,
  };
}
