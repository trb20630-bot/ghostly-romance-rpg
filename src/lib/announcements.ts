export const CURRENT_ANNOUNCEMENT = {
  version: "2026-03-26-v1",
  title: "遊戲更新公告",
  date: "2026年3月26日",
  content: [
    {
      type: "new" as const,
      title: "新功能",
      items: [
        "時間軸系統：故事現在有日夜變化，AI 會記住時間進展",
        "日夜指示器：右上角顯示白天/夜晚狀態",
        "選項按鈕化：A/B/C 選項現在可以直接點擊",
        "對話模式：輸入框新增「對話/指令」切換",
        "字體大小：可調整文字大小（小/中/大）",
        "手動存檔：新增存檔按鈕，隨時存檔",
      ],
    },
    {
      type: "fix" as const,
      title: "問題修復",
      items: [
        "修復 AI 忘記劇情的問題（記憶系統強化）",
        "修復時間軸不一致（後天下雨 → 明天 → 又說後天）",
        "修復返回角色列表需要重新登入的問題",
        "修復 iOS 音量控制無效的問題",
      ],
    },
    {
      type: "improve" as const,
      title: "體驗優化",
      items: [
        "AI 回覆後自動滾動到訊息開頭",
        "TTS 語音支援多角色配音",
        "Token 優化，回覆速度更快",
      ],
    },
  ],
};

export function hasSeenAnnouncement(version: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("announcement_seen") === version;
}

export function markAnnouncementSeen(version: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("announcement_seen", version);
}
