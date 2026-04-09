/** 遊戲 icon 路徑（對應 public/icons/ 下的檔案） */
export const icons = {
  // 新版 PNG icon（從 PSD 素材裁切）
  sound: "/icons/sound.png",
  backpack: "/icons/backpack.png",
  export: "/icons/export.png",
  settings: "/icons/settings.png",
  back: "/icons/back.png",
  music: "/icons/music.png",
  share: "/icons/share.png",
  coin: "/icons/coin.png",
  heart: "/icons/heart.png",
  team: "/icons/team.png",
  save: "/icons/save.png",
  skill: "/icons/skill.png",
  // 別名（向後相容）
  affection: "/icons/heart.png",
  relationship: "/icons/team.png",
  transaction: "/icons/coin.png",
  wallet: "/icons/coin.png",
  purchase: "/icons/coin.png",
  hp: "/icons/skill.png",
  // 其他素材
  login: "/icons/login.svg",
  logout: "/icons/logout.svg",
  yanChixia: "/icons/yan-chixia.svg",
  candle: "/icons/candle.webp",
  lantern: "/icons/lantern.webp",
} as const;

export type IconName = keyof typeof icons;
