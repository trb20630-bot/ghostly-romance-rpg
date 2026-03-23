/**
 * AI 回應驗證與自動修復
 * 確保每個回應都有玩家引導（選項/提示/行動）
 *
 * 強制規則：每個回應結尾必須包含【你的選擇】區塊
 */

// 場景對應的預設行動選項
const LOCATION_ACTIONS: Record<string, string[]> = {
  現代: ["環顧四周觀察環境", "查看手機或隨身物品", "與附近的人交談"],
  輪迴: ["伸手觸碰光芒", "回頭尋找前世記憶", "隨著梵唱前行"],
  金華城: ["在街上打聽蘭若寺的消息", "找間茶館歇腳", "往城北山路走去"],
  蘭若寺: ["探索寺廟庭院", "找一間廂房休息", "留意周圍的動靜"],
  蘭若寺地下: ["靠近古樹根部查看", "尋找小倩的骨灰", "準備迎戰姥姥"],
  墓地: ["尋找安葬骨灰的淨土", "回頭望向蘭若寺", "繼續向南方前進"],
};

// NPC 互動選項
const NPC_ACTIONS: Record<string, string> = {
  聶小倩: "與小倩交談",
  寧采臣: "向寧采臣打招呼",
  燕赤霞: "找燕赤霞詢問降妖之法",
  姥姥: "觀察姥姥的動向",
};

/**
 * 檢查回應是否包含玩家選項區塊
 */
export function hasPlayerChoices(response: string): boolean {
  // 檢查【你的選擇】或【選項】區塊
  if (/【.*選擇.*】|【選項】/.test(response)) return true;

  // 檢查 A. B. C. 或 A）B）C）格式（至少要有 A 和 B 兩個選項）
  if (/A[.、）]\s*.+[\s\S]*B[.、）]\s*.+/m.test(response)) return true;

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
 */
export function ensurePlayerChoices(response: string): string {
  if (!response || !response.trim()) return response;

  if (hasPlayerChoices(response)) return response;

  // 強制加上選項
  const defaultChoices = `\n\n---\n\n【你的選擇】\nA. 探索四周環境\nB. 仔細觀察眼前的狀況\nC. 保持警戒，靜待變化\nD. 或輸入你想做的事`;

  return response.trimEnd().replace(/[.。…]+$/, '') + defaultChoices;
}

/**
 * 根據場景和 NPC 生成情境相關的引導選項
 */
export function generateDefaultGuidance(
  location: string,
  phase: string,
  npcs?: string[]
): string {
  const actions: string[] = [];

  // 場景行動
  const locationActions = LOCATION_ACTIONS[location];
  if (locationActions) {
    actions.push(...locationActions);
  } else {
    // 通用行動
    actions.push("探索四周環境", "仔細觀察眼前的狀況", "保持警戒，靜待變化");
  }

  // NPC 互動（如果有）
  if (npcs && npcs.length > 0) {
    for (const npc of npcs) {
      if (NPC_ACTIONS[npc]) {
        actions.push(NPC_ACTIONS[npc]);
      }
    }
  }

  // 取前 3 個
  const selected = actions.slice(0, 3);
  const letters = ['A', 'B', 'C'];
  const options = selected.map((a, i) => `${letters[i]}. ${a}`).join("\n");

  return `\n\n---\n\n【你的選擇】\n${options}\nD. 或輸入你想做的事`;
}

/**
 * 驗證 AI 回應並自動修復（主要入口）
 * - 如果沒有【你的選擇】區塊 → 根據場景補上
 * - 如果以「...」結尾 → 補上引導
 */
export function validateAndFixResponse(
  response: string,
  context: {
    location: string;
    phase: string;
    npcs?: string[];
  }
): string {
  if (!response || !response.trim()) {
    return response;
  }

  // 已有選項 → 直接通過
  if (hasPlayerChoices(response)) {
    return response;
  }

  // 沒有選項 → 根據場景自動補上
  const guidance = generateDefaultGuidance(context.location, context.phase, context.npcs);
  return response.trimEnd().replace(/[.。…]+$/, '') + guidance;
}
