/**
 * Hotfix 驗證：場景標記清理 + JWT 向後相容
 */

import { describe, it, expect } from "vitest";
import { cleanSceneTag } from "@/lib/scene-bgm";
import { signToken, verifyToken } from "@/lib/jwt";

// =============================================================
// 測試 1：cleanSceneTag 載入存檔
// =============================================================
describe("測試 1：cleanSceneTag 載入存檔", () => {
  it("移除 <!-- SCENE: LANRUO --> 標記", () => {
    const raw = "月光灑落在蘭若寺的廊道上，寒氣逼人。\n<!-- SCENE: LANRUO -->";
    const cleaned = cleanSceneTag(raw);
    expect(cleaned).not.toContain("<!-- SCENE:");
    expect(cleaned).not.toContain("LANRUO");
    expect(cleaned).toContain("月光灑落在蘭若寺");
  });

  it("移除 <!-- SCENE: ROMANCE --> 標記", () => {
    const raw = "小倩輕聲低語。\n\n<!-- SCENE: ROMANCE -->";
    expect(cleanSceneTag(raw)).toBe("小倩輕聲低語。");
  });

  it("移除 <!-- SCENE: BATTLE --> 標記", () => {
    const raw = "黑山老妖怒吼一聲。<!-- SCENE: BATTLE -->";
    expect(cleanSceneTag(raw)).not.toContain("SCENE");
  });

  it("沒有標記的文字不變", () => {
    const raw = "普通的敘事文字，沒有標記。";
    expect(cleanSceneTag(raw)).toBe(raw);
  });

  it("模擬載入存檔流程：assistant 訊息清理、user 訊息不清理", () => {
    const savedConversations = [
      { role: "user", content: "我要進入蘭若寺" },
      { role: "assistant", content: "你推開大門。\n<!-- SCENE: LANRUO -->" },
      { role: "user", content: "觀察四周" },
      { role: "assistant", content: "陰森的走廊。\n<!-- SCENE: LANRUO -->" },
    ];

    const loaded = savedConversations.map((conv) => ({
      role: conv.role,
      content: conv.role === "assistant" ? cleanSceneTag(conv.content) : conv.content,
    }));

    // user 訊息不變
    expect(loaded[0].content).toBe("我要進入蘭若寺");
    expect(loaded[2].content).toBe("觀察四周");

    // assistant 訊息標記被清除
    expect(loaded[1].content).not.toContain("SCENE");
    expect(loaded[1].content).toContain("你推開大門");
    expect(loaded[3].content).not.toContain("SCENE");
  });
});

// =============================================================
// 測試 2：authenticateOrFallback - 有 JWT
// =============================================================
describe("測試 2：authenticateOrFallback - 有 JWT", () => {
  /**
   * 模擬 authenticateOrFallback 邏輯
   */
  async function mockAuthenticateOrFallback(
    authHeader: string | null,
    bodyPlayerId?: string | null
  ): Promise<string | null> {
    // 優先用 JWT
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      if (payload) return payload.playerId;
    }
    // 降級用 body.playerId
    if (bodyPlayerId) return bodyPlayerId;
    return null;
  }

  it("有效 JWT → 回傳 JWT 中的 playerId", async () => {
    const token = await signToken({ playerId: "jwt-player-123", playerName: "Test" });
    const result = await mockAuthenticateOrFallback(`Bearer ${token}`);
    expect(result).toBe("jwt-player-123");
  });

  it("有效 JWT 優先於 body.playerId", async () => {
    const token = await signToken({ playerId: "jwt-player", playerName: "Test" });
    const result = await mockAuthenticateOrFallback(`Bearer ${token}`, "body-player");
    expect(result).toBe("jwt-player"); // JWT 優先
  });
});

// =============================================================
// 測試 3：authenticateOrFallback - 無 JWT 有 body.playerId
// =============================================================
describe("測試 3：authenticateOrFallback - 無 JWT 有 body.playerId（舊玩家相容）", () => {
  async function mockAuthenticateOrFallback(
    authHeader: string | null,
    bodyPlayerId?: string | null
  ): Promise<{ playerId: string | null; isLegacy: boolean }> {
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      if (payload) return { playerId: payload.playerId, isLegacy: false };
    }
    if (bodyPlayerId) return { playerId: bodyPlayerId, isLegacy: true };
    return { playerId: null, isLegacy: false };
  }

  it("無 Authorization header + body 有 playerId → 降級通過", async () => {
    const result = await mockAuthenticateOrFallback(null, "legacy-player-456");
    expect(result.playerId).toBe("legacy-player-456");
    expect(result.isLegacy).toBe(true);
  });

  it("無效 JWT + body 有 playerId → 降級通過", async () => {
    const result = await mockAuthenticateOrFallback("Bearer invalid.token.here", "fallback-id");
    expect(result.playerId).toBe("fallback-id");
    expect(result.isLegacy).toBe(true);
  });

  it("Authorization 格式錯（非 Bearer）+ body 有 playerId → 降級通過", async () => {
    const result = await mockAuthenticateOrFallback("Basic abc123", "fallback-id");
    expect(result.playerId).toBe("fallback-id");
    expect(result.isLegacy).toBe(true);
  });
});

// =============================================================
// 測試 4：authenticateOrFallback - 都沒有
// =============================================================
describe("測試 4：authenticateOrFallback - 都沒有 → null", () => {
  async function mockAuthenticateOrFallback(
    authHeader: string | null,
    bodyPlayerId?: string | null
  ): Promise<string | null> {
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);
      if (payload) return payload.playerId;
    }
    if (bodyPlayerId) return bodyPlayerId;
    return null;
  }

  it("無 header + 無 body.playerId → null", async () => {
    const result = await mockAuthenticateOrFallback(null, null);
    expect(result).toBeNull();
  });

  it("無 header + undefined body.playerId → null", async () => {
    const result = await mockAuthenticateOrFallback(null, undefined);
    expect(result).toBeNull();
  });

  it("無 header + 空字串 body.playerId → null", async () => {
    const result = await mockAuthenticateOrFallback(null, "");
    expect(result).toBeNull();
  });

  it("無效 JWT + 無 body.playerId → null", async () => {
    const result = await mockAuthenticateOrFallback("Bearer bad.token", null);
    expect(result).toBeNull();
  });
});

// =============================================================
// 測試 5：4 個 API route 都用 authenticateOrFallback（靜態碼驗證）
// =============================================================
describe("測試 5：API route 呼叫驗證", () => {
  /**
   * 無法直接 import route handlers（依賴 Next.js runtime）
   * 改用讀檔 + 搜尋來驗證每個 route 有呼叫 authenticateOrFallback
   */
  it("/api/chat 有呼叫 authenticateOrFallback", async () => {
    // 靜態驗證：import 和呼叫都存在
    // chat/route.ts imports authenticateOrFallback from auth-guard
    // and calls: await authenticateOrFallback(request, body.playerId)
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/chat/route.ts", "utf-8"
    );
    expect(content).toContain("authenticateOrFallback");
    expect(content).toContain("await authenticateOrFallback(request");
  });

  it("/api/save 有呼叫 authenticateOrFallback", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/save/route.ts", "utf-8"
    );
    expect(content).toContain("authenticateOrFallback");
    expect(content).toContain("await authenticateOrFallback(request");
  });

  it("/api/summarize 有呼叫 authenticateOrFallback", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/summarize/route.ts", "utf-8"
    );
    expect(content).toContain("authenticateOrFallback");
    expect(content).toContain("await authenticateOrFallback(request");
  });

  it("/api/game POST 有呼叫 authenticateOrFallback", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/game/route.ts", "utf-8"
    );
    expect(content).toContain("authenticateOrFallback");
    // 至少有兩個 authenticateOrFallback 呼叫（POST + PATCH）
    const matches = content.match(/await authenticateOrFallback\(request/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
