/**
 * AI 回應驗證與自動修復
 * 確保每個回應都有玩家引導（選項/提示/行動）
 *
 * 強制規則：每個回應結尾必須包含【你的選擇】區塊，且 A/B/C 三個選項完整
 * 修復策略：不再使用硬編碼後備，由 Haiku 根據敘事內容動態生成
 */

/**
 * 檢查回應是否包含完整的玩家選項區塊（A、B、C 三個都要有）
 */
export function hasPlayerChoices(response: string): boolean {
  // 必須有 A、B、C 三個選項才算完整
  const hasA = /[A][.、）)]\s*.{2,}/m.test(response);
  const hasB = /[B][.、）)]\s*.{2,}/m.test(response);
  const hasC = /[C][.、）)]\s*.{2,}/m.test(response);

  return hasA && hasB && hasC;
}

/**
 * 從回應中提取 A/B/C 選項的文字內容
 */
export function extractChoiceTexts(response: string): { a: string; b: string; c: string } | null {
  const matchA = response.match(/[A][.、）)]\s*(.{2,})/m);
  const matchB = response.match(/[B][.、）)]\s*(.{2,})/m);
  const matchC = response.match(/[C][.、）)]\s*(.{2,})/m);

  if (!matchA || !matchB || !matchC) return null;

  return {
    a: matchA[1].trim(),
    b: matchB[1].trim(),
    c: matchC[1].trim(),
  };
}

/**
 * 計算兩個中文字串的相似度
 * 策略：提取動詞+名詞核心詞（2字詞），比較 Jaccard 重疊
 */
export function choiceSimilarity(a: string, b: string): number {
  const stopwords = /[，。、！？的了是在有不也就都而且或與及一個來去到把被讓給從]/g;
  const cleanA = a.replace(stopwords, "");
  const cleanB = b.replace(stopwords, "");

  if (cleanA.length === 0 && cleanB.length === 0) return 1;
  if (cleanA.length === 0 || cleanB.length === 0) return 0;

  const extractWords = (s: string): string[] => {
    const words: string[] = [];
    for (let i = 0; i < s.length - 1; i++) {
      words.push(s.slice(i, i + 2));
    }
    return words;
  };

  const wordsA = extractWords(cleanA);
  const wordsB = extractWords(cleanB);

  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const matchCount = wordsA.filter((w) => setB.has(w)).length;
  const minLen = Math.min(wordsA.length, wordsB.length);
  return minLen > 0 ? matchCount / minLen : 0;
}

/**
 * 檢查選項是否重複/語意過於相似
 */
export function hasDuplicateChoices(response: string): boolean {
  const choices = extractChoiceTexts(response);
  if (!choices) return false;

  const THRESHOLD = 0.5;
  if (choiceSimilarity(choices.a, choices.b) > THRESHOLD) return true;
  if (choiceSimilarity(choices.a, choices.c) > THRESHOLD) return true;
  if (choiceSimilarity(choices.b, choices.c) > THRESHOLD) return true;

  return false;
}

/**
 * 只擋極端情況（空選項、系統用語、無效填充），其餘信任 AI 的 prompt 引導
 */
const EXTREME_PATTERNS = [
  /^[A-C]\.?\s*$/,            // 空選項（只有字母）
  /^(確定|取消|是|否|好的?)$/,   // 系統用語
  /^\.{3,}$/,                  // 純省略號
  /^(略|無|N\/A)$/i,           // 無效填充
];

function hasExtremeChoices(response: string): boolean {
  const choices = extractChoiceTexts(response);
  if (!choices) return false;

  for (const text of [choices.a, choices.b, choices.c]) {
    const trimmed = text.trim();
    if (EXTREME_PATTERNS.some(p => p.test(trimmed))) return true;
  }
  return false;
}

/**
 * 舊的相容函數名（保持向後相容）
 */
export function hasPlayerGuidance(response: string): boolean {
  return hasPlayerChoices(response);
}

/**
 * 舊介面相容 — 不再注入硬編碼選項
 */
export function ensurePlayerChoices(response: string): string {
  return response;
}

/**
 * 舊介面相容 — 不再生成硬編碼選項
 */
export function generateDefaultGuidance(): string {
  return "";
}

/**
 * 清理被截斷的不完整選項區塊
 * 移除殘缺的【你的選擇】區塊，保留敘事文字
 */
function removeIncompleteChoiceBlock(response: string): string {
  const headerMatch = response.match(/【.*選擇.*】|【選項】/);
  if (!headerMatch || headerMatch.index === undefined) {
    const lines = response.split("\n");
    while (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (
        /^[A-Da-d][.、）)]\s*/.test(lastLine) ||
        lastLine === "---" ||
        lastLine === ""
      ) {
        lines.pop();
      } else {
        break;
      }
    }
    return lines.join("\n");
  }

  return response.slice(0, headerMatch.index).trimEnd();
}

/**
 * 從完整回應中提取選項區塊之前的敘事文字
 */
export function extractNarrativeFromResponse(response: string): string {
  const headerMatch = response.match(/【.*選擇.*】|【選項】/);
  if (headerMatch && headerMatch.index !== undefined) {
    return response.slice(0, headerMatch.index).trim();
  }
  return response.trim();
}

/**
 * 偵測結局/故事完結的標記
 */
function isStoryConclusion(response: string, phase: string): boolean {
  if (phase !== "ending") return false;
  return /此後無憂|從此以後|故事.*(?:結束|落幕|完結)|大結局|全劇終|幸福.*生活|永遠.*在一起|終章.*完|the\s*end/i.test(response);
}

/**
 * 把新選項注入到敘事文字中（替換或新增【你的選擇】區塊）
 */
export function injectChoices(narrative: string, choices: string[]): string {
  if (choices.length < 3) return narrative;
  const letters = ["A", "B", "C"];
  const options = choices.slice(0, 3).map((c, i) => `${letters[i]}. ${c}`).join("\n");
  return `${narrative.trimEnd()}\n\n---\n\n【你的選擇】\n${options}\nD. 或輸入你想做的事`;
}

/**
 * 驗證結果類型
 */
export interface ValidationResult {
  text: string;
  /** 選項是否需要 Haiku 檢查/重新生成 */
  needsChoiceCheck: boolean;
  /** 選項缺失或被移除的原因 */
  choiceIssue?: "truncated" | "missing" | "extreme" | "duplicate";
  /** 提取出的純敘事文字（不含選項區塊） */
  narrative: string;
}

/**
 * 驗證 AI 回應並清理（主要入口）
 * 不再注入硬編碼選項，改為標記需要 Haiku 檢查
 */
export function validateAndFixResponse(
  response: string,
  context: {
    location: string;
    phase: string;
    npcs?: string[];
    truncated?: boolean;
  }
): ValidationResult {
  if (!response || !response.trim()) {
    return { text: response, needsChoiceCheck: false, narrative: "" };
  }

  // 結局完結時不需要選項
  if (isStoryConclusion(response, context.phase)) {
    return { text: response, needsChoiceCheck: false, narrative: response };
  }

  // 被截斷 → 清理殘缺部分，標記需要 Haiku 生成選項
  if (context.truncated) {
    console.warn("[validateResponse] 回應被截斷（max_tokens），清理殘缺部分");
    const cleaned = removeIncompleteChoiceBlock(response);
    return {
      text: cleaned,
      needsChoiceCheck: true,
      choiceIssue: "truncated",
      narrative: cleaned,
    };
  }

  // 已有完整選項
  if (hasPlayerChoices(response)) {
    const narrative = extractNarrativeFromResponse(response);

    // 極端無效選項 → 移除，標記需要重新生成
    if (hasExtremeChoices(response)) {
      console.warn("[validateResponse] 偵測到極端無效選項，移除");
      return {
        text: narrative,
        needsChoiceCheck: true,
        choiceIssue: "extreme",
        narrative,
      };
    }

    // 重複選項 → 標記需要檢查（但保留原文，讓 Haiku 決定）
    if (hasDuplicateChoices(response)) {
      console.warn("[validateResponse] 選項相似度偏高，標記需要 Haiku 檢查");
      return {
        text: response,
        needsChoiceCheck: true,
        choiceIssue: "duplicate",
        narrative,
      };
    }

    // 正常選項 → 仍需 Haiku 品質檢查
    return {
      text: response,
      needsChoiceCheck: true,
      narrative,
    };
  }

  // 選項缺失或不完整 → 清理殘缺，標記需要 Haiku 生成
  console.warn("[validateResponse] 選項不完整，清理殘缺部分");
  const cleaned = removeIncompleteChoiceBlock(response);
  return {
    text: cleaned,
    needsChoiceCheck: true,
    choiceIssue: "missing",
    narrative: cleaned,
  };
}
