import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/save — 儲存對話紀錄 + 更新遊戲狀態
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      roundNumber,
      userMessage,
      assistantMessage,
      model,
      phase,
      currentLocation,
      isDaytime,
    } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getSupabase();

    // 防重複：檢查此 round 是否已存在
    const { data: existing } = await supabase
      .from("conversation_logs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .limit(1);

    if (existing && existing.length > 0) {
      // 此輪已儲存過，跳過避免重複
      return NextResponse.json({ ok: true, skipped: true });
    }

    // 1. 儲存玩家訊息
    await supabase.from("conversation_logs").insert({
      session_id: sessionId,
      round_number: roundNumber,
      role: "user",
      content: userMessage,
      phase,
    });

    // 2. 儲存 AI 回應
    await supabase.from("conversation_logs").insert({
      session_id: sessionId,
      round_number: roundNumber,
      role: "assistant",
      content: assistantMessage,
      model_used: model || "sonnet",
      phase,
    });

    // 3. 更新遊戲進度 + 活動時間
    // updated_at 由 DB trigger 自動更新；也嘗試寫 last_active_at（若欄位存在）
    const updatePayload: Record<string, unknown> = {
      round_number: roundNumber,
      phase,
      current_location: currentLocation,
      is_daytime: isDaytime,
    };
    // 嘗試加入 last_active_at（若 migration 007 已套用則生效，否則被 DB 忽略）
    await supabase
      .from("game_sessions")
      .update(updatePayload)
      .eq("id", sessionId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Save API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "儲存失敗" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/save — 心跳：更新 session 活動時間
 */
export async function PATCH(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    // 心跳：觸發 updated_at trigger 更新活動時間
    // 用一個無害的 update 來觸發 DB 的 updated_at trigger
    const supabase = getSupabase();
    await supabase
      .from("game_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
