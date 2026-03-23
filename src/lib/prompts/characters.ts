/**
 * 角色層 Prompt — 精簡版，NPC 按場景分離載入
 */

export const CHARACTER_PROMPTS = {
  聶小倩: `## 角色：聶小倩線
玩家轉生為聶小倩，十八歲早夭女鬼，被姥姥控制以美色誘人取精血。內心善良渴望解脫。白天須附著物品移動。玩家有現代記憶但受鬼之限制。姥姥會派任務害人，玩家可自選應對。目標：讓寧采臣幫助取回骨灰、脫離姥姥。`,

  寧采臣: `## 角色：寧采臣線
玩家轉生為寧采臣，浙江書生赴金華趕考，慷慨正直不貪美色，無法術僅凡人之身。玩家有現代記憶但無超能力。抵蘭若寺後遇小倩，初被誘惑後獲求助。目標：協助小倩取回骨灰、對抗姥姥。`,
} as const;

/**
 * NPC 資料 — 按場景分離，只載入當前場景需要的 NPC
 */
const NPC_DATA: Record<string, Record<string, string>> = {
  // 寧采臣線 NPC
  "寧采臣_金華城": {
    路人: "商販旅人等，可提供情報暗示城北廢寺鬧鬼",
  },
  "寧采臣_蘭若寺": {
    聶小倩: "美麗女鬼，初見嫵媚動人，後展現善良。說話柔美帶哀愁",
    燕赤霞: "陝西劍客，朴誠寡言武藝高強。說話簡潔直接",
    姥姥: "夜叉妖怪，極度危險。說話陰森可怖",
  },
  "寧采臣_蘭若寺地下": {
    姥姥: "夜叉真身，最終決戰對手",
  },
  "寧采臣_墓地": {},
  // 聶小倩線 NPC
  "聶小倩_金華城": {
    路人: "可能被姥姥指派去害的對象",
  },
  "聶小倩_蘭若寺": {
    寧采臣: "正直書生，慷慨豪爽不貪美色。說話文雅帶書卷氣",
    燕赤霞: "陝西劍客，初見對鬼有敵意。說話簡潔直接",
    姥姥: "夜叉妖怪，控制女鬼。說話陰柔帶威脅",
  },
  "聶小倩_蘭若寺地下": {
    姥姥: "夜叉真身，最終決戰對手",
  },
  "聶小倩_墓地": {},
};

/**
 * 取得當前場景的 NPC 描述
 */
export function getNpcPrompt(character: string, location: string): string {
  const key = `${character}_${location}`;
  const npcs = NPC_DATA[key];
  if (!npcs || Object.keys(npcs).length === 0) return "";

  const lines = Object.entries(npcs)
    .map(([name, desc]) => `${name}：${desc}`)
    .join("；");
  return `\n## 當前場景NPC\n${lines}`;
}

export type CharacterKey = keyof typeof CHARACTER_PROMPTS;
