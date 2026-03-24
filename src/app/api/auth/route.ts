import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { validateAndRepairContext } from "@/lib/context-guard";
import { signToken } from "@/lib/jwt";
import { authenticateRequest, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const SALT_ROUNDS = 10;

/**
 * 判斷密碼是否已經是 bcrypt hash
 */
function isHashed(password: string): boolean {
  return password.startsWith("$2a$") || password.startsWith("$2b$");
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

      // 密碼 hash
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const { data: player, error } = await supabase
        .from("players")
        .insert({ name: name.trim(), password: hashedPassword })
        .select("id, name")
        .single();

      if (error) throw error;

      return NextResponse.json({ player });
    }

    // ===== 登入（回傳玩家 + 所有角色列表 + JWT） =====
    if (action === "login") {
      const { name, password } = body;

      if (!name?.trim() || !password?.trim()) {
        return NextResponse.json({ error: "名稱和密碼不能為空" }, { status: 400 });
      }

      // 取得玩家（含密碼欄位以驗證）
      const { data: player, error } = await supabase
        .from("players")
        .select("id, name, password")
        .eq("name", name.trim())
        .maybeSingle();

      if (error) throw error;
      if (!player) {
        return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
      }

      // 驗證密碼（相容舊的明文密碼）
      if (isHashed(player.password)) {
        // 已 hash：用 bcrypt 比對
        const isValid = await bcrypt.compare(password, player.password);
        if (!isValid) {
          return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
        }
      } else {
        // 舊的明文密碼：直接比對
        if (password !== player.password) {
          return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
        }
        // 比對成功後，自動升級為 hash
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        await supabase
          .from("players")
          .update({ password: hashedPassword })
          .eq("id", player.id);
        console.log(`[auth] Player ${player.id} password upgraded to bcrypt`);
      }

      // 簽發 JWT
      const token = await signToken({
        playerId: player.id,
        playerName: player.name,
      });

      // 取得該玩家所有角色存檔
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("player_id", player.id)
        .order("slot_number", { ascending: true });

      return NextResponse.json({
        player: { id: player.id, name: player.name },
        sessions: sessions || [],
        token,
      });
    }

    // ===== 驗證 token（用於頁面重載時恢復登入狀態） =====
    if (action === "verify") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return unauthorizedResponse();
      }

      // 取得該玩家的存檔列表
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("player_id", auth.playerId)
        .order("slot_number", { ascending: true });

      return NextResponse.json({
        player: { id: auth.playerId, name: auth.playerName },
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

      // 如果 round_number 被修正，用修正後的值
      const effectiveRound = validation.repairedRoundNumber ?? session.round_number;
      const effectiveSession = validation.repairedRoundNumber !== null
        ? { ...session, round_number: effectiveRound }
        : session;

      return NextResponse.json({
        session: effectiveSession,
        memory: validation.memory ? {
          key_facts: validation.memory.key_facts,
          story_summaries: validation.memory.story_summaries,
          last_summarized_round: validation.memory.last_summarized_round,
        } : null,
        conversations: validation.conversations,
        contextIssues: validation.issues.length > 0 ? validation.issues : undefined,
        needsSummary: validation.memory
          ? (effectiveRound - validation.memory.last_summarized_round > 15)
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
