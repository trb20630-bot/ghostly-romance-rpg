import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateAndRepairContext } from "@/lib/context-guard";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/auth — 登入、註冊、取得角色列表、刪除角色、載入角色
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

      const { data: existing } = await supabase
        .from("players")
        .select("id")
        .eq("name", name.trim())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "此名號已被使用" }, { status: 409 });
      }

      const { data: player, error } = await supabase
        .from("players")
        .insert({ name: name.trim(), password })
        .select("id, name")
        .single();

      if (error) throw error;

      return NextResponse.json({ player });
    }

    // ===== 登入（回傳玩家 + 所有角色列表） =====
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

      // 取得該玩家所有角色存檔
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("player_id", player.id)
        .order("slot_number", { ascending: true });

      return NextResponse.json({
        player,
        sessions: sessions || [],
      });
    }

    // ===== 載入特定角色存檔（含完整性檢查 + 自動修復）=====
    if (action === "load_session") {
      const { playerId, sessionId } = body;

      if (!playerId || !sessionId) {
        return NextResponse.json({ error: "缺少參數" }, { status: 400 });
      }

      const { data: session } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("player_id", playerId)
        .single();

      if (!session) {
        return NextResponse.json({ error: "找不到存檔" }, { status: 404 });
      }

      // 完整性檢查 + 自動修復（去重、檢查配對、修復記憶）
      const validation = await validateAndRepairContext(sessionId, playerId);

      if (validation.issues.length > 0) {
        console.warn(`[load_session] ${sessionId} 發現問題:`, validation.issues);
      }

      return NextResponse.json({
        session,
        memory: validation.memory ? {
          key_facts: validation.memory.key_facts,
          story_summaries: validation.memory.story_summaries,
          last_summarized_round: validation.memory.last_summarized_round,
        } : null,
        conversations: validation.conversations,
        contextIssues: validation.issues.length > 0 ? validation.issues : undefined,
        needsSummary: validation.memory
          ? (session.round_number - validation.memory.last_summarized_round > 15)
          : false,
      });
    }

    // ===== 刪除角色存檔 =====
    if (action === "delete_session") {
      const { playerId, sessionId } = body;

      if (!playerId || !sessionId) {
        return NextResponse.json({ error: "缺少參數" }, { status: 400 });
      }

      // 確認是該玩家的存檔
      const { data: session } = await supabase
        .from("game_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (!session) {
        return NextResponse.json({ error: "找不到存檔" }, { status: 404 });
      }

      // CASCADE 會自動刪除 conversation_logs, player_memory
      const { error } = await supabase
        .from("game_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    // ===== 心跳（更新在線狀態） =====
    // 活動時間由 game_sessions.updated_at 追蹤（透過 /api/save PATCH）
    if (action === "heartbeat") {
      return NextResponse.json({ ok: true });
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
