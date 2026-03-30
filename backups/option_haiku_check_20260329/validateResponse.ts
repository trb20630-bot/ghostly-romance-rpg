/**
 * AI 回應驗證與自動修復
 * 確保每個回應都有玩家引導（選項/提示/行動）
 *
 * 強制規則：每個回應結尾必須包含【你的選擇】區塊，且 A/B/C 三個選項完整
 * 修復規則：當 AI 未產生選項時，根據回應內容動態生成情境相關選項
 */

/**
 * 從 AI 敘事文字中提取關鍵元素，用於生成情境選項
 */
function extractNarrativeContext(text: string): {
  npcs: string[];
  objects: string[];
  threats: string[];
  actions: string[];
} {
  const npcs: string[] = [];
  const objects: string[] = [];
  const threats: string[] = [];
  const actions: string[] = [];

  // 偵測 NPC
  const npcPatterns: [RegExp, string][] = [
    [/小倩|聶小倩/, "小倩"],
    [/寧采臣|采臣/, "寧采臣"],
    [/燕赤霞|赤霞/, "燕赤霞"],
    [/姥姥|老妖/, "姥姥"],
    [/黑山老妖/, "黑山老妖"],
    [/判官/, "判官"],
    [/書生/, "書生"],
    [/道士/, "道士"],
    [/女子|女鬼/, "女子"],
    [/老人|老者/, "老者"],
    [/商人|攤販/, "商人"],
  ];
  for (const [pattern, name] of npcPatterns) {
    if (pattern.test(text) && !npcs.includes(name)) {
      npcs.push(name);
    }
  }

  // 偵測物品/環境元素
  const objectPatterns: [RegExp, string][] = [
    [/書卷|書冊|古書|書本/, "書卷"],
    [/玉佩|玉/, "玉佩"],
    [/琴|古琴/, "古琴"],
    [/劍|寶劍|長劍/, "劍"],
    [/符咒|符紙|道符/, "符咒"],
    [/門|大門|房門|廟門/, "門"],
    [/燈籠|紅燈籠/, "燈籠"],
    [/棺材|棺/, "棺材"],
    [/骨灰|骨罈/, "骨灰"],
    [/古樹|老樹|大樹/, "古樹"],
    [/井|枯井/, "井"],
    [/鏡|銅鏡/, "鏡"],
    [/香囊/, "香囊"],
    [/傘|油紙傘/, "傘"],
    [/畫|字畫|卷軸/, "字畫"],
    [/信|書信|紙條/, "信"],
    [/藥|草藥|丹藥/, "藥"],
  ];
  for (const [pattern, name] of objectPatterns) {
    if (pattern.test(text) && !objects.includes(name)) {
      objects.push(name);
    }
  }

  // 偵測威脅/緊急狀態
  const threatPatterns: [RegExp, string][] = [
    [/妖氣|陰氣|鬼氣|邪氣/, "妖邪之氣逼近"],
    [/追|逃|跑|躲/, "正在被追擊"],
    [/傷|痛|血|受傷/, "身受傷害"],
    [/陽光|天亮|日出|日光/, "天將破曉"],
    [/控制|操控|附身/, "受到控制"],
    [/戰|打|攻|擊/, "戰鬥中"],
    [/吼|怒|暴|狂/, "敵人暴怒"],
  ];
  for (const [pattern, desc] of threatPatterns) {
    if (pattern.test(text) && !threats.includes(desc)) {
      threats.push(desc);
    }
  }

  // 偵測可能的行動暗示
  const actionPatterns: [RegExp, string][] = [
    [/聲音|聲響|響聲/, "循著聲音查看"],
    [/光芒|光線|亮光/, "朝光芒走去"],
    [/氣味|香氣|臭味|味道/, "順著氣味追蹤"],
    [/小路|通道|暗門|密道/, "沿著通道前進"],
    [/腳印|痕跡|血跡/, "跟隨痕跡"],
    [/呼喊|呼救|哭聲|喊/, "循聲前往"],
  ];
  for (const [pattern, action] of actionPatterns) {
    if (pattern.test(text) && !actions.includes(action)) {
      actions.push(action);
    }
  }

  return { npcs, objects, threats, actions };
}

/**
 * 根據 AI 敘事內容動態生成情境選項
 * 絕不使用泛用/萬用選項
 */
function generateContextualChoices(
  narrativeText: string,
  location: string,
  phase: string,
  npcs?: string[]
): string {
  const ctx = extractNarrativeContext(narrativeText);
  const allNpcs = [...new Set([...(npcs || []), ...ctx.npcs])];
  const choices: string[] = [];

  // 優先級 1：NPC 互動（如果有 NPC 出現）
  if (allNpcs.length > 0) {
    const npcActions: Record<string, string[]> = {
      小倩: ["向小倩搭話，詢問她的身世", "靜靜觀察小倩的舉動", "試著靠近小倩"],
      寧采臣: ["向寧采臣自我介紹", "問寧采臣為何來此", "請寧采臣一同前行"],
      燕赤霞: ["請教燕赤霞降妖之術", "向燕赤霞打聽蘭若寺的秘密", "請求燕赤霞的幫助"],
      姥姥: ["試探姥姥的底細", "假裝順從姥姥的指示", "尋找機會逃離姥姥"],
      黑山老妖: ["尋找老妖的弱點", "與同伴商議對策", "嘗試拖延時間"],
    };
    for (const npc of allNpcs) {
      const npcOpts = npcActions[npc];
      if (npcOpts && choices.length < 3) {
        choices.push(npcOpts[Math.floor(Math.random() * npcOpts.length)]);
      }
    }
  }

  // 優先級 2：威脅回應
  if (ctx.threats.length > 0 && choices.length < 3) {
    const threatResponses: Record<string, string[]> = {
      "妖邪之氣逼近": ["凝神感應妖氣的來源方向", "立即尋找掩體躲避", "取出護身之物戒備"],
      "正在被追擊": ["加速奔跑尋找藏身處", "轉身面對追兵", "施展計策甩開追擊"],
      "身受傷害": ["檢查傷勢並包紮", "忍痛繼續前進", "找個安全的地方養傷"],
      "天將破曉": ["立刻尋找可附著的物品", "趕往最近的陰暗處", "請求同伴掩護"],
      "受到控制": ["拼命抵抗意識中的控制", "順從表象暗中觀察", "呼喚同伴的名字"],
      "戰鬥中": ["全力施展攻擊", "尋找破綻伺機反擊", "且戰且退保存體力"],
      "敵人暴怒": ["趁亂尋找突破口", "冷靜分析對方弱點", "聯合同伴夾擊"],
    };
    for (const threat of ctx.threats) {
      const responses = threatResponses[threat];
      if (responses && choices.length < 3) {
        choices.push(responses[Math.floor(Math.random() * responses.length)]);
      }
    }
  }

  // 優先級 3：物品互動
  if (ctx.objects.length > 0 && choices.length < 3) {
    const obj = ctx.objects[0];
    choices.push(`仔細查看${obj}`);
  }

  // 優先級 4：環境行動暗示
  if (ctx.actions.length > 0 && choices.length < 3) {
    for (const action of ctx.actions) {
      if (choices.length < 3) choices.push(action);
    }
  }

  // 優先級 5：階段特定後備選項（非泛用）
  if (choices.length < 3) {
    const phaseSpecific: Record<string, string[]> = {
      death: ["回憶生前最後的記憶", "嘗試觸碰自己的身體", "追尋遠方微弱的光芒"],
      reincarnation: ["伸手觸碰眼前的光芒", "回想自己是誰", "嘗試開口說話"],
      story: [],
      ending: ["拼盡全力完成最後一擊", "呼喊同伴的名字求援", "用智慧尋找最終破解之法"],
    };
    const phaseOpts = phaseSpecific[phase] || [];
    for (const opt of phaseOpts) {
      if (choices.length < 3) choices.push(opt);
    }
  }

  // 優先級 6：場景特定後備（比舊版更具體）
  if (choices.length < 3) {
    const locationSpecific: Record<string, string[]> = {
      現代: ["翻找口袋裡的物品", "回想出事前發生了什麼", "大聲呼救看有沒有人回應"],
      輪迴: ["順著輪迴通道的光走下去", "抓住一片飄過的前世記憶碎片", "閉眼聆聽遠方的梵唱"],
      金華城: ["在街邊攤販打聽消息", "循著香氣找到一間小店", "沿著城北的山路前行"],
      蘭若寺: ["推開眼前的房門查看", "沿著走廊深處探索", "登上寺廟的閣樓"],
      蘭若寺地下: ["摸索地下通道的牆壁", "靠近古樹根部仔細察看", "尋找地下出口的線索"],
      墓地: ["辨認墓碑上的文字", "在亂墳間尋找一塊淨土", "沿著墓地邊緣小路離開"],
    };
    const locOpts = locationSpecific[location] || [
      "仔細聆聽周圍的動靜",
      "回想之前獲得的線索",
      "嘗試與身邊的人對話",
    ];
    for (const opt of locOpts) {
      if (choices.length < 3 && !choices.includes(opt)) choices.push(opt);
    }
  }

  // 確保有 3 個選項
  const fallbacks = ["回想之前獲得的線索", "深呼吸整理思緒再行動", "嘗試呼喚記憶中的名字"];
  let fallbackIdx = 0;
  while (choices.length < 3) {
    choices.push(fallbacks[fallbackIdx++]);
  }

  const letters = ["A", "B", "C"];
  const options = choices
    .slice(0, 3)
    .map((a, i) => `${letters[i]}. ${a}`)
    .join("\n");

  return `\n\n---\n\n【你的選擇】\n${options}\nD. 或輸入你想做的事`;
}

/**
 * 檢查回應是否包含完整的玩家選項區塊（A、B、C 三個都要有）
 */
export function hasPlayerChoices(response: string): boolean {
  // 檢查【你的選擇】或【選項】區塊
  const hasHeader = /【.*選擇.*】|【選項】/.test(response);

  // 必須有 A、B、C 三個選項才算完整
  const hasA = /[A][.、）)]\s*.{2,}/m.test(response);
  const hasB = /[B][.、）)]\s*.{2,}/m.test(response);
  const hasC = /[C][.、）)]\s*.{2,}/m.test(response);

  // 有標頭 + ABC 三個都有 = 完整
  if (hasHeader && hasA && hasB && hasC) return true;

  // 沒標頭但 ABC 三個都有也算
  if (hasA && hasB && hasC) return true;

  return false;
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
  // 去除停用字和標點
  const stopwords = /[，。、！？的了是在有不也就都而且或與及一個來去到把被讓給從]/g;
  const cleanA = a.replace(stopwords, "");
  const cleanB = b.replace(stopwords, "");

  if (cleanA.length === 0 && cleanB.length === 0) return 1;
  if (cleanA.length === 0 || cleanB.length === 0) return 0;

  // 提取所有 2-gram 作為「詞」的近似
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

  // 計算重疊的 2-gram 數量（允許多次匹配）
  const setB = new Set(wordsB);
  const matchCount = wordsA.filter((w) => setB.has(w)).length;

  // 用較短的那方做分母（Overlap coefficient — 對短句更公平）
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
 * 確保回應包含玩家選項（強制版）
 * 注意：此函數已不建議直接使用，請用 validateAndFixResponse
 */
export function ensurePlayerChoices(response: string): string {
  if (!response || !response.trim()) return response;
  if (hasPlayerChoices(response)) return response;

  // 使用動態生成（無上下文時的後備）
  const choices = generateContextualChoices(response, "蘭若寺", "story");
  return response.trimEnd().replace(/[.。…]+$/, "") + choices;
}

/**
 * 保留舊介面相容性
 */
export function generateDefaultGuidance(
  location: string,
  phase: string,
  npcs?: string[]
): string {
  // 委派到新的動態生成函數，帶空敘事
  return generateContextualChoices("", location, phase, npcs);
}

/**
 * 清理被截斷的不完整選項區塊
 * 移除殘缺的【你的選擇】區塊，保留敘事文字
 */
function removeIncompleteChoiceBlock(response: string): string {
  // 找到【你的選擇】或【選項】的位置
  const headerMatch = response.match(/【.*選擇.*】|【選項】/);
  if (!headerMatch || headerMatch.index === undefined) {
    // 沒有選項標頭，檢查是否有孤立的 A. B. 開頭（被截斷的選項）
    // 從尾部找到最後一段完整的敘事
    const lines = response.split("\n");
    while (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      // 移除不完整的選項行和分隔線
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

  // 有標頭但選項不完整 → 移除整個選項區塊
  return response.slice(0, headerMatch.index).trimEnd();
}

/**
 * 從完整回應中提取選項區塊之前的敘事文字
 */
function extractNarrativeFromResponse(response: string): string {
  const headerMatch = response.match(/【.*選擇.*】|【選項】/);
  if (headerMatch && headerMatch.index !== undefined) {
    return response.slice(0, headerMatch.index).trim();
  }
  return response.trim();
}

/**
 * 驗證 AI 回應並自動修復（主要入口）
 * - 如果回應被截斷（truncated） → 清理殘缺部分 + 根據敘事內容動態補上選項
 * - 如果沒有【你的選擇】區塊 → 根據敘事內容動態補上
 * - 如果選項不完整（只有 A、B 沒有 C） → 清理 + 動態補上
 * - 如果選項為泛用/萬用選項 → 清除並根據敘事重新生成
 */
/**
 * 偵測結局/故事完結的標記
 * 結局時 AI 不會輸出選項，這是正確的，不應強制加上
 */
function isStoryConclusion(response: string, phase: string): boolean {
  if (phase !== "ending") return false;
  return /此後無憂|從此以後|故事.*(?:結束|落幕|完結)|大結局|全劇終|幸福.*生活|永遠.*在一起|終章.*完|the\s*end/i.test(response);
}

export function validateAndFixResponse(
  response: string,
  context: {
    location: string;
    phase: string;
    npcs?: string[];
    truncated?: boolean;
  }
): string {
  if (!response || !response.trim()) {
    return response;
  }

  // 結局完結時不強制加選項 — 故事已結束
  if (isStoryConclusion(response, context.phase)) {
    return response;
  }

  // 如果被截斷，先清理不完整的尾部
  if (context.truncated) {
    console.warn("[validateResponse] 回應被截斷（max_tokens），正在修復...");
    const cleaned = removeIncompleteChoiceBlock(response);
    const choices = generateContextualChoices(
      cleaned,
      context.location,
      context.phase,
      context.npcs
    );
    return cleaned.trimEnd().replace(/[.。…]+$/, "") + choices;
  }

  // 已有完整選項 → 只擋極端情況，其餘信任 AI 的 prompt 引導
  if (hasPlayerChoices(response)) {
    // 相似度偏高時僅記錄，不重生（信任 AI 的 few-shot 引導）
    if (hasDuplicateChoices(response)) {
      console.warn("[validateResponse] 選項相似度偏高（僅記錄，不重生）");
    }

    // 只在極端情況才 reject（空選項、系統用語等）
    if (!hasExtremeChoices(response)) {
      return response;
    }

    console.warn("[validateResponse] 偵測到極端無效選項，根據敘事重新生成...");
    const narrative = extractNarrativeFromResponse(response);
    const choices = generateContextualChoices(
      narrative,
      context.location,
      context.phase,
      context.npcs
    );
    return narrative.trimEnd().replace(/[.。…]+$/, "") + choices;
  }

  // 選項缺失或不完整 → 清理殘缺 + 根據敘事內容動態補上
  console.warn("[validateResponse] 選項不完整，根據敘事動態補上...");
  const cleaned = removeIncompleteChoiceBlock(response);
  const choices = generateContextualChoices(
    cleaned,
    context.location,
    context.phase,
    context.npcs
  );
  return cleaned.trimEnd().replace(/[.。…]+$/, "") + choices;
}
