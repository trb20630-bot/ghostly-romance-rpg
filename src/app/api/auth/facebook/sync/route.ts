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

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * POST /api/auth/facebook/sync
 * Facebook OAuth 完成後，同步用戶到 players 表
 */
export async function POST(request: NextRequest) {
  try {
    const { facebookId, email, displayName, avatarUrl, referralCode } = await request.json();

    if (!facebookId) {
      return NextResponse.json({ error: "缺少 Facebook ID" }, { status: 400 });
    }

    const supabase = getSupabase();

    // 查找是否已有此 Facebook 用戶
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id, name")
      .eq("facebook_id", facebookId)
      .maybeSingle();

    let playerId: string;
    let playerName: string | null;

    if (existingPlayer) {
      // 已有帳號：更新 Facebook 資料
      playerId = existingPlayer.id;
      playerName = existingPlayer.name;
      await supabase
        .from("players")
        .update({
          facebook_email: email,
          facebook_display_name: displayName,
          facebook_avatar_url: avatarUrl || null,
        })
        .eq("id", playerId);
    } else {
      // 新用戶：建立帳號（name 先設為 null，之後在 setup-profile 設定）

      // 生成邀請碼
      let newReferralCode = "";
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateReferralCode();
        const { data: codeExists } = await supabase
          .from("players")
          .select("id")
          .eq("referral_code", candidate)
          .maybeSingle();
        if (!codeExists) {
          newReferralCode = candidate;
          break;
        }
      }

      // 處理邀請碼
      let inviterId: string | null = null;
      if (referralCode && referralCode.length === 6) {
        const { data: inviter } = await supabase
          .from("players")
          .select("id")
          .eq("referral_code", referralCode.toUpperCase())
          .maybeSingle();
        if (inviter) inviterId = inviter.id;
      }

      const { data: newPlayer, error: insertError } = await supabase
        .from("players")
        .insert({
          name: null,
          password: "",
          facebook_id: facebookId,
          facebook_email: email,
          facebook_display_name: displayName,
          facebook_avatar_url: avatarUrl || null,
          auth_provider: "facebook",
          referral_code: newReferralCode || null,
          referred_by: inviterId,
        })
        .select("id, name")
        .single();

      if (insertError) {
        console.error("[Facebook sync] Insert error:", insertError);
        return NextResponse.json({ error: "建立帳號失敗" }, { status: 500 });
      }

      playerId = newPlayer.id;
      playerName = newPlayer.name;

      // 處理邀請獎勵
      if (inviterId) {
        try {
          await supabase.from("referral_records").insert({
            inviter_id: inviterId,
            invitee_id: playerId,
            inviter_reward_coins: 15,
            inviter_reward_rounds: 5,
            invitee_reward_coins: 5,
          });

          const { data: inviterSession } = await supabase
            .from("game_sessions")
            .select("id")
            .eq("player_id", inviterId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (inviterSession) {
            const { data: inviterStats } = await supabase
              .from("player_stats")
              .select("silver")
              .eq("session_id", inviterSession.id)
              .maybeSingle();

            if (inviterStats) {
              await supabase
                .from("player_stats")
                .update({ silver: (inviterStats.silver ?? 0) + 15 })
                .eq("session_id", inviterSession.id);
            }
          }
        } catch (refErr) {
          console.error("[Facebook sync] Referral reward error:", refErr);
        }
      }
    }

    // 簽發 JWT（僅在有暱稱時才簽發）
    const token = playerName
      ? await signToken({ playerId, playerName })
      : null;

    return NextResponse.json({
      player: { id: playerId, name: playerName },
      token,
    });
  } catch (error) {
    console.error("Facebook sync error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
