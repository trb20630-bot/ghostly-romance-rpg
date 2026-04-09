import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LINE_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const CHANNEL_ID = (process.env.LINE_CHANNEL_ID || "2009758693").trim();
const CALLBACK_URL = (process.env.LINE_CALLBACK_URL || "https://app-five-rust-94.vercel.app/api/auth/line/callback").trim();

/**
 * GET /api/auth/line/login
 * 重導向到 LINE 授權頁面
 */
export async function GET(request: NextRequest) {
  // 生成 CSRF state token
  const state = crypto.randomUUID();

  // 檢查是否有 referral code（從 query param 傳入）
  const referralCode = request.nextUrl.searchParams.get("ref") || "";

  // 把 state 和 referralCode 編碼到 state 參數中
  const statePayload = JSON.stringify({ csrf: state, ref: referralCode });
  const encodedState = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CHANNEL_ID,
    redirect_uri: CALLBACK_URL,
    state: encodedState,
    scope: "profile openid",
  });

  const response = NextResponse.redirect(`${LINE_AUTH_URL}?${params.toString()}`);

  // 將 CSRF state 存入 cookie 以便 callback 驗證
  response.cookies.set("line_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 分鐘
    path: "/",
  });

  return response;
}
