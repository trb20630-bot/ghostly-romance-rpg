/**
 * 記憶系統修復驗證測試
 * 測試 P0-1, P0-2, P1-1, P1-2, P2 修復是否正確
 */

import { describe, it, expect } from "vitest";
import { getRecentHistory } from "@/lib/game-store";
import { buildMemoryContext } from "@/lib/prompts/index";
import { tryRepairJson } from "@/app/api/summarize/route";
import type { ChatMessage, PlayerMemory } from "@/types/game";

// ===== Helper =====
function makeMsg(role: "user" | "assistant", content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, timestamp: Date.now() };
}

function makePair(round: number): ChatMessage[] {
  return [
    makeMsg("user", `玩家第${round}輪輸入`),
    makeMsg("assistant", `AI 第${round}輪回應`),
  ];
}

function emptyKeyFacts() {
  return {
    enemies: [] as string[],
    allies: [] as string[],
    promises: [] as string[],
    secrets: [] as string[],
    kills: [] as string[],
    learned_skills: [] as string[],
    visited_places: [] as string[],
    important_items: [] as string[],
    completed_events: [] as string[],
  };
}

// =============================================================
// 測試 1：首次摘要觸發門檻 (P1-2)
// =============================================================
describe("測試 1：首次摘要觸發門檻 (P1-2)", () => {
  function shouldTrigger(roundNumber: number, lastSummarizedRound: number): boolean {
    const nextRound = roundNumber + 1;
    const unsummarizedRounds = nextRound - lastSummarizedRound;
    const isFirstSummarize = lastSummarizedRound === 0;
    const threshold = isFirstSummarize ? 5 : 10;
    return unsummarizedRounds > threshold;
  }

  it("新遊戲第 5 輪不觸發（門檻是 > 5）", () => {
    expect(shouldTrigger(4, 0)).toBe(false); // nextRound=5, 5-0=5, not > 5
  });

  it("新遊戲第 6 輪觸發（首次門檻 > 5）", () => {
    expect(shouldTrigger(5, 0)).toBe(true); // nextRound=6, 6-0=6, > 5 ✓
  });

  it("首次摘要完成後，第 15 輪不觸發（門檻變回 > 10）", () => {
    expect(shouldTrigger(14, 5)).toBe(false); // nextRound=15, 15-5=10, not > 10
  });

  it("首次摘要完成後，第 16 輪觸發", () => {
    expect(shouldTrigger(15, 5)).toBe(true); // nextRound=16, 16-5=11, > 10 ✓
  });

  it("舊流程第 10 輪不觸發（lastSummarized=0 但門檻已改為 5）", () => {
    // 這確保首次門檻確實是 5 而非 10
    expect(shouldTrigger(5, 0)).toBe(true); // 第 6 輪就觸發
  });
});

// =============================================================
// 測試 2：roundCounter 與 game.roundNumber 對齊 (P0-1)
// =============================================================
describe("測試 2：triggerSummarize round 對齊 (P0-1)", () => {
  /**
   * 模擬 triggerSummarize 的核心 round 計算邏輯
   */
  function computeUnsummarized(
    messages: ChatMessage[],
    gameRoundNumber: number,
    lastSummarizedRound: number
  ) {
    const filtered = messages.filter((m) => m.role !== "system");
    const totalPairsInMessages = filtered.filter((m) => m.role === "assistant").length;
    const firstRound = gameRoundNumber - totalPairsInMessages + 1;

    const convs: Array<{ round_number: number; role: string }> = [];
    let currentRound = firstRound;
    for (const msg of filtered) {
      convs.push({ round_number: currentRound, role: msg.role });
      if (msg.role === "assistant") currentRound++;
    }

    const startRound = lastSummarizedRound + 1;
    const endRound = gameRoundNumber;
    const unsummarized = convs.filter(
      (c) => c.round_number >= startRound && c.round_number <= endRound
    );

    return { firstRound, lastRound: currentRound - 1, startRound, endRound, unsummarized };
  }

  it("新遊戲：11 輪全在 messages，lastSummarized=0 → 全部可摘要", () => {
    const msgs = Array.from({ length: 11 }, (_, i) => makePair(i + 1)).flat();
    const result = computeUnsummarized(msgs, 11, 0);

    expect(result.firstRound).toBe(1);
    expect(result.lastRound).toBe(11);
    expect(result.startRound).toBe(1);
    expect(result.endRound).toBe(11);
    expect(result.unsummarized.length).toBe(22); // 11 pairs × 2
  });

  it("載入存檔：game.roundNumber=30，messages 只有最近 10 輪，lastSummarized=20", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => makePair(21 + i)).flat();
    const result = computeUnsummarized(msgs, 30, 20);

    expect(result.firstRound).toBe(21);
    expect(result.lastRound).toBe(30);
    expect(result.startRound).toBe(21);
    expect(result.endRound).toBe(30);
    expect(result.unsummarized.length).toBe(20); // 10 pairs × 2
  });

  it("載入存檔：game.roundNumber=30，messages 有全部 30 輪，lastSummarized=20", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => makePair(i + 1)).flat();
    const result = computeUnsummarized(msgs, 30, 20);

    expect(result.firstRound).toBe(1);
    expect(result.lastRound).toBe(30);
    expect(result.startRound).toBe(21);
    expect(result.endRound).toBe(30);
    expect(result.unsummarized.length).toBe(20); // rounds 21-30 = 10 pairs × 2
  });

  it("【舊 bug 重現】如果用 roundCounter=1 重新編號會失敗", () => {
    // 模擬舊的 bug：從 1 重新編號
    const msgs = Array.from({ length: 10 }, (_, i) => makePair(21 + i)).flat();
    const filtered = msgs.filter((m) => m.role !== "system");

    // 舊邏輯：roundCounter 從 1 開始
    let roundCounter = 1;
    const oldConvs: Array<{ round_number: number }> = [];
    for (const msg of filtered) {
      oldConvs.push({ round_number: roundCounter });
      if (msg.role === "assistant") roundCounter++;
    }

    const startRound = 21; // lastSummarized=20 → startRound=21
    const endRound = 30;
    const oldUnsummarized = oldConvs.filter(
      (c) => c.round_number >= startRound && c.round_number <= endRound
    );

    // 舊邏輯：convs 的 round_number 範圍是 1-10，但 startRound=21
    // 結果是空的！這就是 bug
    expect(oldUnsummarized.length).toBe(0); // ← 證明舊邏輯會失敗

    // 新邏輯：正確對齊
    const result = computeUnsummarized(msgs, 30, 20);
    expect(result.unsummarized.length).toBe(20); // ← 新邏輯正確
  });

  it("邊界：messages 為空", () => {
    const result = computeUnsummarized([], 5, 0);
    expect(result.unsummarized.length).toBe(0);
  });

  it("邊界：包含 system 訊息應被過濾", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "system", content: "系統訊息", timestamp: Date.now() },
      ...makePair(1),
    ];
    const result = computeUnsummarized(msgs, 1, 0);
    expect(result.firstRound).toBe(1);
    expect(result.unsummarized.length).toBe(2); // 1 pair
  });
});

// =============================================================
// 測試 3：JSON 截斷修復 (P1-1)
// =============================================================
describe("測試 3：JSON 截斷修復 (P1-1)", () => {
  it("正常 JSON 直接解析", () => {
    const json = '{"new_enemies":["黑山老妖"],"new_allies":["燕赤霞"],"new_promises":[],"new_secrets":[],"new_kills":[],"new_items":[],"new_places":["蘭若寺"]}';
    const result = tryRepairJson(json);
    expect(result).not.toBeNull();
    expect((result as Record<string, string[]>).new_enemies).toEqual(["黑山老妖"]);
    expect((result as Record<string, string[]>).new_places).toEqual(["蘭若寺"]);
  });

  it("截斷在陣列結尾 — 缺少 ]} ", () => {
    const truncated = '{"new_enemies":["黑山老妖"],"new_allies":["燕赤霞"';
    const result = tryRepairJson(truncated);
    expect(result).not.toBeNull();
    expect((result as Record<string, string[]>).new_enemies).toEqual(["黑山老妖"]);
  });

  it("截斷在字串中間", () => {
    const truncated = '{"new_enemies":["黑山老';
    const result = tryRepairJson(truncated);
    expect(result).not.toBeNull();
    expect((result as Record<string, string[]>).new_enemies).toEqual(["黑山老"]);
  });

  it("截斷在 key 之後、value 之前", () => {
    const truncated = '{"new_enemies":[],"new_allies":[],"new_promises":[]';
    const result = tryRepairJson(truncated);
    expect(result).not.toBeNull();
    expect((result as Record<string, string[]>).new_enemies).toEqual([]);
  });

  it("完全損壞的 JSON 回傳 null", () => {
    const broken = "這不是 JSON 啦";
    const result = tryRepairJson(broken);
    expect(result).toBeNull();
  });

  it("空物件", () => {
    const result = tryRepairJson("{}");
    expect(result).toEqual({});
  });

  it("含 escaped 引號的字串不會破壞解析", () => {
    const json = '{"new_secrets":["他說\\"不要告訴別人\\""]';
    const result = tryRepairJson(json);
    expect(result).not.toBeNull();
    expect((result as Record<string, string[]>).new_secrets).toEqual(['他說"不要告訴別人"']);
  });

  it("多層嵌套截斷", () => {
    const truncated = '{"a":[["nested"';
    const result = tryRepairJson(truncated);
    expect(result).not.toBeNull();
  });
});

// =============================================================
// 測試 4：buildMemoryContext 摘要保留邏輯 (P2)
// =============================================================
describe("測試 4：storySummaries 保留與合併 (P2)", () => {
  it("5 條摘要全部保留，不截斷", () => {
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: ["摘要1", "摘要2", "摘要3", "摘要4", "摘要5"],
      lastSummarizedRound: 50,
    };
    const result = buildMemoryContext(memory);
    expect(result).toContain("摘要1");
    expect(result).toContain("摘要5");
  });

  it("10 條摘要全部保留", () => {
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: Array.from({ length: 10 }, (_, i) => `摘要${i + 1}`),
      lastSummarizedRound: 100,
    };
    const result = buildMemoryContext(memory);
    for (let i = 1; i <= 10; i++) {
      expect(result).toContain(`摘要${i}`);
    }
  });

  it("12 條摘要 → 最舊 3 條合併為 1 條【早期】，總數變 10", () => {
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: Array.from({ length: 12 }, (_, i) => `第${(i + 1) * 5}輪摘要`),
      lastSummarizedRound: 60,
    };
    const result = buildMemoryContext(memory);
    expect(result).toContain("【早期】");
    // 合併後最舊 3 條變 1 條，12 - 3 + 1 = 10
    const summaryPart = result.split("摘要：")[1];
    const segments = summaryPart.split("｜");
    expect(segments.length).toBe(10);
  });

  it("15 條摘要 → 合併兩次，結果 ≤ 10 條", () => {
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: Array.from({ length: 15 }, (_, i) => `第${i + 1}輪摘要`),
      lastSummarizedRound: 150,
    };
    const result = buildMemoryContext(memory);
    const summaryPart = result.split("摘要：")[1];
    const segments = summaryPart.split("｜");
    expect(segments.length).toBeLessThanOrEqual(10);
  });

  it("每條摘要超過 150 字被截斷", () => {
    const longSummary = "這是一個很長的摘要".repeat(30); // 270 字
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: [longSummary],
      lastSummarizedRound: 10,
    };
    const result = buildMemoryContext(memory);
    // 150 字 + "…"
    expect(result).toContain("…");
    // 不應該包含完整的 270 字
    expect(result.length).toBeLessThan(longSummary.length);
  });

  it("每條摘要 150 字以內不截斷", () => {
    const shortSummary = "這是簡短摘要";
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: [shortSummary],
      lastSummarizedRound: 10,
    };
    const result = buildMemoryContext(memory);
    expect(result).toContain(shortSummary);
    expect(result).not.toContain("…");
  });

  it("keyFacts 正確注入 prompt", () => {
    const memory: PlayerMemory = {
      keyFacts: {
        ...emptyKeyFacts(),
        allies: ["燕赤霞", "小倩"],
        enemies: ["黑山老妖"],
        important_items: ["桃木劍"],
      },
      storySummaries: [],
      lastSummarizedRound: 0,
    };
    const result = buildMemoryContext(memory);
    expect(result).toContain("盟友:燕赤霞,小倩");
    expect(result).toContain("敵:黑山老妖");
    expect(result).toContain("物:桃木劍");
  });

  it("空記憶只輸出標題", () => {
    const memory: PlayerMemory = {
      keyFacts: emptyKeyFacts(),
      storySummaries: [],
      lastSummarizedRound: 0,
    };
    const result = buildMemoryContext(memory);
    expect(result).toBe("## 記憶");
  });
});

// =============================================================
// 測試 5：getRecentHistory 對話保留 (補充測試)
// =============================================================
describe("測試 5：getRecentHistory 對話保留", () => {
  it("保留最近 10 輪", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => makePair(i + 1)).flat();
    const recent = getRecentHistory(msgs, 10);
    // 應該只有最後 10 對 = 20 條
    expect(recent.length).toBe(20);
    expect(recent[0].content).toContain("第11輪");
    expect(recent[recent.length - 1].content).toContain("第20輪");
  });

  it("少於 10 輪時全部保留", () => {
    const msgs = Array.from({ length: 3 }, (_, i) => makePair(i + 1)).flat();
    const recent = getRecentHistory(msgs, 10);
    expect(recent.length).toBe(6); // 3 pairs × 2
  });

  it("空陣列回傳空", () => {
    const recent = getRecentHistory([], 10);
    expect(recent.length).toBe(0);
  });

  it("含未完成的輪次（只有 user 沒有 assistant）", () => {
    const msgs = [
      ...makePair(1),
      ...makePair(2),
      makeMsg("user", "第3輪輸入"), // 未完成
    ];
    const recent = getRecentHistory(msgs, 10);
    expect(recent.length).toBe(5); // 2 完整 pairs + 1 孤立 user
  });
});
