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

    // 3. 更新遊戲進度
    await supabase
      .from("game_sessions")
      .update({
        round_number: roundNumber,
        phase,
        current_location: currentLocation,
        is_daytime: isDaytime,
      })
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
