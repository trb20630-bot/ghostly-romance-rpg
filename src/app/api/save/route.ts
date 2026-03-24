import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/save — 儲存對話紀錄 + 更新遊戲狀態（原子性操作）
 *
 * 含 JWT 驗證 + session 歸屬驗證
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
      playerId: bodyPlayerId,
    } = body;

    // JWT 驗證（向後相容）
    const playerId = await authenticateOrFallback(request, bodyPlayerId);
    if (!playerId) {
      return unauthorizedResponse();
    }

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getSupabase();

    // 驗證 sessionId 屬於該玩家
    const { data: sessionCheck } = await supabase
      .from("game_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (!sessionCheck) {
      console.error(`[save] Session ownership check failed: session=${sessionId}, player=${playerId}`);
      return NextResponse.json({ error: "無效的存檔" }, { status: 403 });
    }

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

    // 用 batch insert 一次插入兩條 conversation_logs（減少失敗窗口）
    const { error: insertError } = await supabase
      .from("conversation_logs")
      .insert([
        {
          session_id: sessionId,
          round_number: roundNumber,
          role: "user",
          content: userMessage,
          phase,
        },
        {
          session_id: sessionId,
          round_number: roundNumber,
          role: "assistant",
          content: assistantMessage,
          model_used: model || "sonnet",
          phase,
        },
      ]);

    if (insertError) {
      console.error("[save] conversation_logs insert failed:", insertError);
      return NextResponse.json(
        { error: "對話儲存失敗：" + insertError.message },
        { status: 500 }
      );
    }

    // 更新遊戲進度（對話已安全寫入，現在更新 session）
    const { error: updateError } = await supabase
      .from("game_sessions")
      .update({
        round_number: roundNumber,
        phase,
        current_location: currentLocation,
        is_daytime: isDaytime,
      })
      .eq("id", sessionId);

    if (updateError) {
      // 對話已寫入但 session 更新失敗 — 記錄錯誤但不回滾對話
      // 下次載入時 validateAndRepairContext 會用對話數修正 round_number
      console.error("[save] game_sessions update failed:", updateError);
      return NextResponse.json(
        { error: "進度更新失敗：" + updateError.message, conversationsSaved: true },
        { status: 500 }
      );
    }

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
