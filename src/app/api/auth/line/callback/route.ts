import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signToken } from "@/lib/jwt";

export const runtime = "nodejs";

const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const CHANNEL_ID = (process.env.LINE_CHANNEL_ID || "2009758693").trim();
const CHANNEL_SECRET = (process.env.LINE_CHANNEL_SECRET || "f0dba90a50df001390b582abbd5b2629").trim();
const CALLBACK_URL = (process.env.LINE_CALLBACK_URL || "https://app-five-rust-94.vercel.app/api/auth/line/callback").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app-five-rust-94.vercel.app").trim();

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
 * GET /api/auth/line/callback
 * LINE OAuth callback：code → token → profile → 建立/更新玩家 → JWT → 跳轉
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");

  // 用戶取消授權
  if (error) {
    return NextResponse.redirect(`${APP_URL}/?line_error=cancelled`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${APP_URL}/?line_error=missing_params`);
  }

  // 驗證 CSRF state
  let referralCode = "";
  try {
    const statePayload = JSON.parse(Buffer.from(stateParam, "base64url").toString());
    const savedState = request.cookies.get("line_oauth_state")?.value;
    if (!savedState || savedState !== statePayload.csrf) {
      return NextResponse.redirect(`${APP_URL}/?line_error=csrf_mismatch`);
    }
    referralCode = statePayload.ref || "";
  } catch {
    return NextResponse.redirect(`${APP_URL}/?line_error=invalid_state`);
  }

  try {
    // Step 1: 用 code 換取 access_token
    const tokenRes = await fetch(LINE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK_URL,
        client_id: CHANNEL_ID,
        client_secret: CHANNEL_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[LINE] Token exchange failed:", errBody);
      return NextResponse.redirect(`${APP_URL}/?line_error=token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Step 2: 用 access_token 取得用戶資料
    const profileRes = await fetch(LINE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      console.error("[LINE] Profile fetch failed:", await profileRes.text());
      return NextResponse.redirect(`${APP_URL}/?line_error=profile_failed`);
    }

    const profile = await profileRes.json();
    const { userId, displayName, pictureUrl } = profile;

    if (!userId) {
      return NextResponse.redirect(`${APP_URL}/?line_error=no_user_id`);
    }

    const supabase = getSupabase();

    // Step 3: 查找或建立玩家
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id, name")
      .eq("line_user_id", userId)
      .maybeSingle();

    let playerId: string;
    let playerName: string;
    let isNewUser = false;

    if (existingPlayer) {
      // 現有玩家：更新 LINE 資料
      playerId = existingPlayer.id;
      playerName = existingPlayer.name;
      await supabase
        .from("players")
        .update({
          line_display_name: displayName,
          line_picture_url: pictureUrl || null,
        })
        .eq("id", playerId);
    } else {
      // 新玩家：建立帳號
      isNewUser = true;

      // 確保名稱不重複（加隨機後綴）
      let name = displayName || "LINE玩家";
      const { data: nameExists } = await supabase
        .from("players")
        .select("id")
        .eq("name", name)
        .maybeSingle();

      if (nameExists) {
        const suffix = Math.floor(Math.random() * 9000 + 1000);
        name = `${name}${suffix}`;
      }

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
          name,
          password: "", // LINE 登入不需要密碼
          line_user_id: userId,
          line_display_name: displayName,
          line_picture_url: pictureUrl || null,
          auth_provider: "line",
          referral_code: newReferralCode || null,
          referred_by: inviterId,
        })
        .select("id, name")
        .single();

      if (insertError) {
        console.error("[LINE] Player insert error:", insertError);
        return NextResponse.redirect(`${APP_URL}/?line_error=create_failed`);
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
          console.error("[LINE] Referral reward error:", refErr);
        }
      }
    }

    // Step 4: 簽發 JWT
    const token = await signToken({ playerId, playerName });

    // Step 5: 重導向到遊戲，帶上 token 資訊
    const params = new URLSearchParams({
      line_token: token,
      line_player_id: playerId,
      line_player_name: playerName,
      ...(isNewUser ? { line_new: "1" } : {}),
    });

    const response = NextResponse.redirect(`${APP_URL}/?${params.toString()}`);
    // 清除 CSRF cookie
    response.cookies.delete("line_oauth_state");
    return response;
  } catch (err) {
    console.error("[LINE] Callback error:", err);
    return NextResponse.redirect(`${APP_URL}/?line_error=server_error`);
  }
}
