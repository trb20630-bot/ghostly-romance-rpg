/**
 * API 請求認證守衛
 * 從 Authorization header 提取並驗證 JWT
 *
 * 向後相容：如果沒有 token 但 body 裡有 playerId，暫時允許通過
 * 這確保舊玩家在重新登入取得 token 前不會被擋住
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, type TokenPayload } from "./jwt";

/**
 * 驗證請求的 JWT token，回傳 playerId 和 playerName
 * 失敗時回傳 null
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<TokenPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  return verifyToken(token);
}

/**
 * 認證或降級：優先用 JWT，沒有 token 時用 body 裡的 playerId（向後相容）
 * 回傳 playerId 字串，失敗回傳 null
 */
export async function authenticateOrFallback(
  request: NextRequest,
  bodyPlayerId?: string | null
): Promise<string | null> {
  // 優先用 JWT
  const auth = await authenticateRequest(request);
  if (auth) {
    return auth.playerId;
  }

  // 向後相容：沒有 JWT 時用 body 裡的 playerId
  if (bodyPlayerId) {
    console.warn("[auth-guard] No JWT token, falling back to body playerId (legacy)");
    return bodyPlayerId;
  }

  return null;
}

/**
 * 驗證失敗時的標準回應
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "未授權，請重新登入", code: "UNAUTHORIZED" },
    { status: 401 }
  );
}
