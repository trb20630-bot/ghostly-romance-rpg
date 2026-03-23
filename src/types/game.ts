// ===== 玩家設定 =====
export interface PlayerProfile {
  id?: string;
  characterName: string;
  age: number;
  gender: "male" | "female" | "other";
  occupation: string;
  character: "聶小倩" | "寧采臣";
}

// ===== 遊戲狀態 =====
export type GamePhase =
  | "setup"          // 玩家設定
  | "character"      // 選擇轉生角色
  | "death"          // 現代死亡劇情
  | "reincarnation"  // 輪迴轉生過場
  | "story"          // 主故事線
  | "ending"         // 結局
  | "export";        // 故事匯出

export interface GameState {
  phase: GamePhase;
  player: PlayerProfile | null;
  sessionId: string | null;
  slotNumber: number;
  roundNumber: number;
  currentLocation: string;
  isDaytime: boolean;
  sceneTag: string | null;
  ttsPlaying: boolean;
}

// ===== 對話系統 =====
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  model?: "sonnet" | "haiku";
}

// ===== 記憶系統 =====
export interface KeyFacts {
  enemies: string[];
  allies: string[];
  promises: string[];
  secrets: string[];
  kills: string[];
  learned_skills: string[];
  visited_places: string[];
  important_items: string[];
}

export interface PlayerMemory {
  keyFacts: KeyFacts;
  storySummaries: string[];
  lastSummarizedRound: number;
}

// ===== 存檔系統 =====
export interface SaveSlot {
  slotNumber: number;
  playerProfile: PlayerProfile;
  phase: GamePhase;
  roundNumber: number;
  lastPlayed: string;
  preview: string;
}

// ===== 故事匯出 =====
export interface StoryExport {
  title: string;
  chapters: StoryChapter[];
  totalWords: number;
  exportedAt: string;
}

export interface StoryChapter {
  number: number;
  title: string;
  content: string;
}

// ===== API 回應 =====
export interface ChatResponse {
  message: string;
  model: "sonnet" | "haiku";
  updatedMemory?: Partial<PlayerMemory>;
  phaseTransition?: GamePhase;
  locationChange?: string;
  timeChange?: boolean;
}
