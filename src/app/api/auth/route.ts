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
 * POST /api/auth — 登入或註冊
 * body: { action: "login" | "register" | "list", name?, password? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabase();

    // ===== 取得所有玩家名稱 =====
    if (action === "list") {
      const { data, error } = await supabase
        .from("players")
        .select("name")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const names = (data || [])
        .map((p: { name: string | null }) => p.name)
        .filter(Boolean);

      return NextResponse.json({ names });
    }

    // ===== 註冊 =====
    if (action === "register") {
      const { name, password } = body;

      if (!name?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "名稱和密碼不能為空" }, { status: 400 });
      }

      // 檢查名稱是否已存在
      const { data: existing } = await supabase
        .from("players")
        .select("id")
        .eq("name", name.trim())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "此名號已被使用" }, { status: 409 });
      }

      // 建立玩家
      const { data: player, error } = await supabase
        .from("players")
        .insert({
          name: name.trim(),
          password: password,
        })
        .select("id, name")
        .single();

      if (error) throw error;

      return NextResponse.json({ player });
    }

    // ===== 登入 =====
    if (action === "login") {
      const { name, password } = body;

      if (!name?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "名稱和密碼不能為空" }, { status: 400 });
      }

      const { data: player, error } = await supabase
        .from("players")
        .select("id, name")
        .eq("name", name.trim())
        .eq("password", password)
        .maybeSingle();

      if (error) throw error;

      if (!player) {
        return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
      }

      // 取得該玩家的遊戲存檔
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("player_id", player.id)
        .order("updated_at", { ascending: false });

      // 取得存檔的記憶
      let memory = null;
      let conversations: Array<{ round_number: number; role: string; content: string; phase: string }> = [];
      if (sessions && sessions.length > 0) {
        const session = sessions[0];

        const { data: mem } = await supabase
          .from("player_memory")
          .select("*")
          .eq("session_id", session.id)
          .maybeSingle();

        if (mem) memory = mem;

        // 取得對話紀錄
        const { data: logs } = await supabase
          .from("conversation_logs")
          .select("round_number, role, content, phase")
          .eq("session_id", session.id)
          .order("round_number", { ascending: true })
          .order("created_at", { ascending: true });

        if (logs) conversations = logs;
      }

      return NextResponse.json({
        player,
        session: sessions?.[0] || null,
        memory,
        conversations,
      });
    }

    return NextResponse.json({ error: "無效的操作" }, { status: 400 });
  } catch (error) {
    console.error("Auth API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
