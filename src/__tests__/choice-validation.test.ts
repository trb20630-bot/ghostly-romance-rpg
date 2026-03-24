/**
 * 選項驗證測試（問題 3 + 4 修復）
 * 測試重複檢查、泛用檢查、validateAndFixResponse
 */

import { describe, it, expect } from "vitest";
import {
  hasPlayerChoices,
  validateAndFixResponse,
  choiceSimilarity,
  hasDuplicateChoices,
  extractChoiceTexts,
} from "@/lib/validateResponse";

// =============================================================
// 選項提取
// =============================================================
describe("extractChoiceTexts", () => {
  it("提取 A. B. C. 格式", () => {
    const response = `一些敘事\n\n【你的選擇】\nA. 向小倩搭話\nB. 拿起桃木劍\nC. 逃離蘭若寺\nD. 或輸入你想做的事`;
    const choices = extractChoiceTexts(response);
    expect(choices).not.toBeNull();
    expect(choices!.a).toBe("向小倩搭話");
    expect(choices!.b).toBe("拿起桃木劍");
    expect(choices!.c).toBe("逃離蘭若寺");
  });

  it("提取 A）B）C）格式", () => {
    const response = `敘事\nA）觀察小倩\nB）詢問老者\nC）離開此地`;
    const choices = extractChoiceTexts(response);
    expect(choices).not.toBeNull();
    expect(choices!.a).toBe("觀察小倩");
  });

  it("缺少 C 時回傳 null", () => {
    const response = `A. 行動一\nB. 行動二`;
    const choices = extractChoiceTexts(response);
    expect(choices).toBeNull();
  });
});

// =============================================================
// 相似度計算
// =============================================================
describe("choiceSimilarity", () => {
  it("完全相同 → 1.0", () => {
    expect(choiceSimilarity("觀察小倩的反應", "觀察小倩的反應")).toBe(1);
  });

  it("完全不同 → 接近 0", () => {
    const sim = choiceSimilarity("拿起桃木劍", "逃離蘭若寺");
    expect(sim).toBeLessThan(0.3);
  });

  it("高度相似（同一件事不同措辭）→ > 0.5", () => {
    const sim = choiceSimilarity("觀察小倩的反應", "仔細觀察小倩的表情");
    expect(sim).toBeGreaterThan(0.5);
  });

  it("中等相似（有共同元素但方向不同）→ 低於高度相似", () => {
    const simHigh = choiceSimilarity("觀察小倩的反應", "仔細觀察小倩的表情");
    const simMed = choiceSimilarity("向小倩搭話詢問身世", "靜靜觀察小倩的舉動");
    // 中等相似應該低於高度相似
    expect(simMed).toBeLessThan(simHigh);
    expect(simMed).toBeLessThan(0.6);
  });

  it("空字串處理", () => {
    expect(choiceSimilarity("", "")).toBe(1);
    expect(choiceSimilarity("測試", "")).toBe(0);
  });
});

// =============================================================
// 重複選項檢測
// =============================================================
describe("hasDuplicateChoices", () => {
  it("三個完全不同的選項 → false", () => {
    const response = `【你的選擇】
A. 向小倩搭話，詢問她的身世
B. 拿起桌上的桃木劍
C. 轉身逃離蘭若寺
D. 或輸入你想做的事`;
    expect(hasDuplicateChoices(response)).toBe(false);
  });

  it("A 和 B 幾乎相同 → true", () => {
    const response = `【你的選擇】
A. 觀察小倩的反應
B. 仔細觀察小倩的表情
C. 拿起桃木劍戒備
D. 或輸入你想做的事`;
    expect(hasDuplicateChoices(response)).toBe(true);
  });

  it("B 和 C 幾乎相同 → true", () => {
    const response = `【你的選擇】
A. 向燕赤霞請教降妖之術
B. 小心翼翼走進蘭若寺大殿查看
C. 小心謹慎走進蘭若寺正殿查看
D. 或輸入你想做的事`;
    expect(hasDuplicateChoices(response)).toBe(true);
  });

  it("沒有選項 → false（不是重複問題）", () => {
    const response = "一些敘事，沒有選項";
    expect(hasDuplicateChoices(response)).toBe(false);
  });
});

// =============================================================
// hasPlayerChoices
// =============================================================
describe("hasPlayerChoices", () => {
  it("完整的 A/B/C 選項 → true", () => {
    const response = `敘事\n\n【你的選擇】\nA. 行動一\nB. 行動二\nC. 行動三`;
    expect(hasPlayerChoices(response)).toBe(true);
  });

  it("只有 A 和 B → false", () => {
    const response = `敘事\n\n【你的選擇】\nA. 行動一\nB. 行動二`;
    expect(hasPlayerChoices(response)).toBe(false);
  });

  it("沒有選項 → false", () => {
    expect(hasPlayerChoices("純敘事文字")).toBe(false);
  });

  it("用「...」結尾 → false", () => {
    expect(hasPlayerChoices("敘事文字...")).toBe(false);
  });
});

// =============================================================
// validateAndFixResponse 完整流程
// =============================================================
describe("validateAndFixResponse", () => {
  const ctx = { location: "蘭若寺", phase: "story" };

  it("完整且不重複的選項 → 原樣通過", () => {
    const response = `月光灑在蘭若寺的廊道上，小倩的身影若隱若現。

【你的選擇】
A. 向小倩搭話，詢問她為何在此徘徊
B. 悄悄跟隨小倩，看她去向何處
C. 轉身去找燕赤霞商議對策
D. 或輸入你想做的事
<!-- SCENE: ROMANCE -->`;
    const result = validateAndFixResponse(response, ctx);
    expect(result).toBe(response); // 原樣通過
  });

  it("沒有選項 → 自動補上", () => {
    const response = "月光灑在蘭若寺的廊道上，小倩的身影若隱若現。";
    const result = validateAndFixResponse(response, ctx);
    expect(hasPlayerChoices(result)).toBe(true);
    expect(result).toContain("【你的選擇】");
    expect(result).toContain("A.");
    expect(result).toContain("B.");
    expect(result).toContain("C.");
  });

  it("有泛用選項 → 清除並重新生成", () => {
    const response = `敘事\n\n【你的選擇】\nA. 探索四周環境\nB. 觀察周圍動靜\nC. 繼續前行\nD. 或輸入你想做的事`;
    const result = validateAndFixResponse(response, ctx);
    expect(result).not.toContain("探索四周環境");
    expect(hasPlayerChoices(result)).toBe(true);
  });

  it("有重複選項 → 清除並重新生成", () => {
    const response = `小倩出現在你面前。

【你的選擇】
A. 觀察小倩的反應
B. 仔細觀察小倩的表情
C. 靜靜觀察小倩的舉動
D. 或輸入你想做的事`;
    const result = validateAndFixResponse(response, ctx);
    // 重複的選項應該被替換
    expect(result).toContain("【你的選擇】");
    // 新選項應該包含小倩相關的具體行動（因為敘事中提到小倩）
    expect(hasPlayerChoices(result)).toBe(true);
  });

  it("被截斷的回應 → 清理並補上選項", () => {
    const response = `敘事文字\n\n【你的選擇】\nA. 行動一\nB. 行動`;
    const result = validateAndFixResponse(response, { ...ctx, truncated: true });
    expect(hasPlayerChoices(result)).toBe(true);
  });

  it("空回應 → 原樣回傳", () => {
    expect(validateAndFixResponse("", ctx)).toBe("");
    expect(validateAndFixResponse("  ", ctx)).toBe("  ");
  });
});
