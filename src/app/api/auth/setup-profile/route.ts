import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signToken } from "@/lib/jwt";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/auth/setup-profile
 * 新用戶設定暱稱
 */
export async function POST(request: NextRequest) {
  try {
    const { playerId, name } = await request.json();

    if (!playerId) {
      return NextResponse.json({ error: "缺少玩家 ID" }, { status: 400 });
    }

    // 驗證暱稱格式
    const trimmed = (name || "").trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return NextResponse.json(
        { error: "暱稱須為 2-20 個字元" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // 檢查暱稱是否已被使用
    const { data: existing } = await supabase
      .from("players")
      .select("id")
      .eq("name", trimmed)
      .neq("id", playerId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "此暱稱已被使用，請換一個" },
        { status: 409 }
      );
    }

    // 更新暱稱
    const { error: updateError } = await supabase
      .from("players")
      .update({ name: trimmed })
      .eq("id", playerId);

    if (updateError) {
      console.error("[setup-profile] Update error:", updateError);
      return NextResponse.json({ error: "更新失敗" }, { status: 500 });
    }

    // 重新簽發 JWT（name 已變更）
    const token = await signToken({ playerId, playerName: trimmed });

    return NextResponse.json({
      player: { id: playerId, name: trimmed },
      token,
    });
  } catch (error) {
    console.error("[setup-profile] Error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
