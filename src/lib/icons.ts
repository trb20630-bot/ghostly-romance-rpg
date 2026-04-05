/** 遊戲 icon 路徑（對應 public/icons/ 下的 SVG 檔案） */
export const icons = {
  relationship: "/icons/relationship.svg",
  share: "/icons/share.svg",
  hp: "/icons/hp.svg",
  transaction: "/icons/transaction.svg",
  affection: "/icons/affection.svg",
  back: "/icons/back.svg",
  backpack: "/icons/backpack.svg",
  sound: "/icons/sound.svg",
  login: "/icons/login.svg",
  logout: "/icons/logout.svg",
  export: "/icons/export.svg",
  settings: "/icons/settings.svg",
  yanChixia: "/icons/yan-chixia.svg",
  wallet: "/icons/wallet.svg",
  purchase: "/icons/purchase.svg",
} as const;

export type IconName = keyof typeof icons;
