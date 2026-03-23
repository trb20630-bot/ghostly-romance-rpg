/**
 * 場景標記 → BGM 對應（共用模組）
 * 用於 BgmPlayer、ExportView、StoryPage
 */

export const SCENE_BGM: Record<string, string> = {
  MODERN: "/audio/Midnight In The Boardroom.mp3",
  DEATH: "/audio/Midnight In The Boardroom.mp3",
  REBIRTH: "/audio/Ethereal Ascent.mp3",
  LANRUO: "/audio/幽寺阴风.mp3",
  ROMANCE: "/audio/月影幽恋.mp3",
  BATTLE: "/audio/冥锋对决.mp3",
  ENDING: "/audio/余音不散.mp3",
};

/** 異常的場景轉換組合 */
const ABNORMAL_TRANSITIONS: Array<[string, string]> = [
  ["ENDING", "MODERN"],
  ["REBIRTH", "BATTLE"],
  ["ENDING", "DEATH"],
  ["ENDING", "REBIRTH"],
];

/** 從章節文本推斷場景標記 */
export function detectSceneFromContent(title: string, content: string): string {
  const text = `${title} ${content}`;

  if (/戰鬥|搏鬥|劍|斬|殺|妖氣|衝鋒|廝殺|對決|法術|符咒/.test(text)) return "BATTLE";
  if (/結局|終章|解脫|自由|骨灰.*安葬|重獲新生|遷葬/.test(text)) return "ENDING";
  if (/死亡|猝死|車禍|意外|靈魂離體|最後一口氣|倒在.*血泊/.test(text)) return "DEATH";
  if (/浪漫|愛|柔情|心動|月下|相依|深情|嫵媚|傾心|纏綿|小倩.*笑|小倩.*淚/.test(text)) return "ROMANCE";
  if (/輪迴|轉生|前世|虛空|混沌|梵唱|光芒/.test(text)) return "REBIRTH";
  if (/蘭若寺|廢寺|姥姥|女鬼|陰風|鬼影|磷火|古樹|夜叉/.test(text)) return "LANRUO";
  if (/現代|手機|電腦|公司|辦公|都市|捷運|咖啡/.test(text)) return "MODERN";

  if (/序章|現代/.test(title)) return "MODERN";
  if (/楔子|輪迴/.test(title)) return "REBIRTH";
  if (/終章|結局|尾聲/.test(title)) return "ENDING";

  return "LANRUO";
}

/** 從 AI 回覆中提取場景標記 */
export function extractSceneTag(text: string): string | null {
  const match = text.match(/<!-- SCENE: (\w+) -->/);
  return match ? match[1] : null;
}

/** 移除場景標記 */
export function cleanSceneTag(text: string): string {
  return text.replace(/\s*<!-- SCENE: \w+ -->\s*/g, "").trim();
}

/** 判斷場景轉換是否異常 */
export function isAbnormalTransition(from: string | null, to: string): boolean {
  if (!from) return false;
  return ABNORMAL_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/**
 * 音樂切換日誌（fire-and-forget，前端呼叫）
 */
export async function logMusicSwitch(params: {
  sessionId: string | null;
  fromScene: string | null;
  toScene: string;
  aiSnippet?: string;
  isAbnormal: boolean;
}): Promise<void> {
  if (!params.sessionId) return;
  try {
    await fetch("/api/music-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // fire-and-forget
  }
}
