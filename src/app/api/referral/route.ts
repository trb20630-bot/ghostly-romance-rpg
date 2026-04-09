import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/referral
 * 取得玩家邀請資訊（邀請碼、已邀請人數、是否已分享）
 */
export async function GET(request: NextRequest) {
  try {
    const playerId = await authenticateOrFallback(request);
    if (!playerId) return unauthorizedResponse();

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
    }

    const { data: player } = await supabase
      .from("players")
      .select("referral_code, has_shared, share_reward_claimed")
      .eq("id", playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
    }

    // 取得邀請記錄
    const { data: records } = await supabase
      .from("referral_records")
      .select("id, invitee_id, created_at")
      .eq("inviter_id", playerId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      referralCode: player.referral_code,
      hasShared: player.has_shared || false,
      shareRewardClaimed: player.share_reward_claimed || false,
      inviteCount: records?.length || 0,
      records: records || [],
    });
  } catch (error) {
    console.error("Referral GET error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}

/**
 * POST /api/referral
 * action: "claim_share_reward" — 點擊分享按鈕獎勵 5 墨幣
 * action: "validate_code" — 驗證邀請碼是否有效
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
    }

    // ===== 領取分享獎勵 =====
    if (action === "claim_share_reward") {
      const playerId = await authenticateOrFallback(request, body.playerId);
      if (!playerId) return unauthorizedResponse();

      const { data: player } = await supabase
        .from("players")
        .select("share_reward_claimed")
        .eq("id", playerId)
        .single();

      if (!player) {
        return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
      }

      if (player.share_reward_claimed) {
        return NextResponse.json({ error: "已領取過分享獎勵", alreadyClaimed: true }, { status: 409 });
      }

      // 標記已分享 + 已領獎
      await supabase
        .from("players")
        .update({ has_shared: true, share_reward_claimed: true })
        .eq("id", playerId);

      // 獎勵 5 墨幣（找到該玩家最新的 session）
      const { data: latestSession } = await supabase
        .from("game_sessions")
        .select("id")
        .eq("player_id", playerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSession) {
        const { data: stats } = await supabase
          .from("player_stats")
          .select("silver")
          .eq("session_id", latestSession.id)
          .maybeSingle();

        if (stats) {
          await supabase
            .from("player_stats")
            .update({ silver: (stats.silver ?? 0) + 5 })
            .eq("session_id", latestSession.id);
        } else {
          await supabase
            .from("player_stats")
            .insert({ session_id: latestSession.id, silver: 5, items: [], followers: [], skills: [], relationships: {} });
        }
      }

      return NextResponse.json({ success: true, silverAwarded: 5 });
    }

    // ===== 驗證邀請碼 =====
    if (action === "validate_code") {
      const { code } = body;
      if (!code || code.length !== 6) {
        return NextResponse.json({ valid: false });
      }

      const { data: inviter } = await supabase
        .from("players")
        .select("id, name")
        .eq("referral_code", code.toUpperCase())
        .maybeSingle();

      return NextResponse.json({
        valid: !!inviter,
        inviterName: inviter?.name || null,
      });
    }

    return NextResponse.json({ error: "無效的操作" }, { status: 400 });
  } catch (error) {
    console.error("Referral POST error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
