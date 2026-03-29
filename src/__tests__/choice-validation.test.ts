/**
 * 選項驗證測試
 * 測試重複檢查、極端檢查、validateAndFixResponse
 */

import { describe, it, expect } from "vitest";
import {
  hasPlayerChoices,
  validateAndFixResponse,
  choiceSimilarity,
  hasDuplicateChoices,
  extractChoiceTexts,
  injectChoices,
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
// injectChoices
// =============================================================
describe("injectChoices", () => {
  it("正確注入三個選項", () => {
    const result = injectChoices("敘事內容", ["行動一", "行動二", "行動三"]);
    expect(result).toContain("【你的選擇】");
    expect(result).toContain("A. 行動一");
    expect(result).toContain("B. 行動二");
    expect(result).toContain("C. 行動三");
    expect(result).toContain("D. 或輸入你想做的事");
  });

  it("選項不足三個 → 原樣回傳", () => {
    expect(injectChoices("敘事", ["一", "二"])).toBe("敘事");
  });
});

// =============================================================
// validateAndFixResponse（回傳 ValidationResult）
// =============================================================
describe("validateAndFixResponse", () => {
  const ctx = { location: "蘭若寺", phase: "story" };

  it("完整且不重複的選項 → needsChoiceCheck=true（交由 Haiku 判斷）", () => {
    const response = `月光灑在蘭若寺的廊道上，小倩的身影若隱若現。

【你的選擇】
A. 向小倩搭話，詢問她為何在此徘徊
B. 悄悄跟隨小倩，看她去向何處
C. 轉身去找燕赤霞商議對策
D. 或輸入你想做的事`;
    const result = validateAndFixResponse(response, ctx);
    expect(result.text).toBe(response);
    expect(result.needsChoiceCheck).toBe(true);
    expect(result.choiceIssue).toBeUndefined();
  });

  it("沒有選項 → needsChoiceCheck=true, choiceIssue='missing'", () => {
    const response = "月光灑在蘭若寺的廊道上，小倩的身影若隱若現。";
    const result = validateAndFixResponse(response, ctx);
    expect(result.needsChoiceCheck).toBe(true);
    expect(result.choiceIssue).toBe("missing");
    expect(result.narrative).toContain("小倩");
  });

  it("重複選項 → needsChoiceCheck=true, choiceIssue='duplicate'", () => {
    const response = `小倩出現在你面前。

【你的選擇】
A. 觀察小倩的反應
B. 仔細觀察小倩的表情
C. 靜靜觀察小倩的舉動
D. 或輸入你想做的事`;
    const result = validateAndFixResponse(response, ctx);
    expect(result.needsChoiceCheck).toBe(true);
    expect(result.choiceIssue).toBe("duplicate");
  });

  it("被截斷的回應 → needsChoiceCheck=true, choiceIssue='truncated'", () => {
    const response = `敘事文字\n\n【你的選擇】\nA. 行動一\nB. 行動`;
    const result = validateAndFixResponse(response, { ...ctx, truncated: true });
    expect(result.needsChoiceCheck).toBe(true);
    expect(result.choiceIssue).toBe("truncated");
    expect(hasPlayerChoices(result.text)).toBe(false); // 殘缺被清除
  });

  it("空回應 → needsChoiceCheck=false", () => {
    const result = validateAndFixResponse("", ctx);
    expect(result.text).toBe("");
    expect(result.needsChoiceCheck).toBe(false);
  });

  it("結局 → needsChoiceCheck=false", () => {
    const response = "從此以後，二人幸福地生活在一起。全劇終。";
    const result = validateAndFixResponse(response, { location: "蘭若寺", phase: "ending" });
    expect(result.needsChoiceCheck).toBe(false);
  });
});
