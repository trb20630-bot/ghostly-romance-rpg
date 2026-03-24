/**
 * API 請求認證守衛
 * 從 Authorization header 提取並驗證 JWT
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
 * 驗證失敗時的標準回應
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "未授權，請重新登入" }, { status: 401 });
}
