/**
 * 遊戲狀態管理（Client-side store）
 * 使用 React Context + useReducer
 */

import type {
  GameState,
  GamePhase,
  PlayerProfile,
  ChatMessage,
  PlayerMemory,
  KeyFacts,
} from "@/types/game";

// ===== Actions =====
export type GameAction =
  | { type: "SET_PLAYER"; payload: PlayerProfile }
  | { type: "SET_PHASE"; payload: GamePhase }
  | { type: "SET_SESSION_ID"; payload: string }
  | { type: "SET_LOCATION"; payload: string }
  | { type: "SET_DAYTIME"; payload: boolean }
  | { type: "SET_SCENE_TAG"; payload: string | null }
  | { type: "SET_TTS_PLAYING"; payload: boolean }
  | { type: "INCREMENT_ROUND" }
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | { type: "UPDATE_MEMORY"; payload: Partial<PlayerMemory> }
  | { type: "CLEAR_MESSAGES" }
  | { type: "LOAD_STATE"; payload: Partial<FullGameState> }
  | { type: "RESET" };

export interface FullGameState {
  game: GameState;
  messages: ChatMessage[];
  memory: PlayerMemory;
}

// ===== Initial State =====
export const initialMemory: PlayerMemory = {
  keyFacts: {
    enemies: [],
    allies: [],
    promises: [],
    secrets: [],
    kills: [],
    learned_skills: [],
    visited_places: [],
    important_items: [],
  },
  storySummaries: [],
  lastSummarizedRound: 0,
};

export const initialState: FullGameState = {
  game: {
    phase: "setup",
    player: null,
    sessionId: null,
    slotNumber: 1,
    roundNumber: 0,
    currentLocation: "現代",
    isDaytime: true,
    sceneTag: null,
    ttsPlaying: false,
  },
  messages: [],
  memory: initialMemory,
};

// ===== Reducer =====
export function gameReducer(
  state: FullGameState,
  action: GameAction
): FullGameState {
  switch (action.type) {
    case "SET_PLAYER":
      return {
        ...state,
        game: { ...state.game, player: action.payload },
      };

    case "SET_PHASE":
      return {
        ...state,
        game: { ...state.game, phase: action.payload },
      };

    case "SET_SESSION_ID":
      return {
        ...state,
        game: { ...state.game, sessionId: action.payload },
      };

    case "SET_LOCATION":
      return {
        ...state,
        game: { ...state.game, currentLocation: action.payload },
      };

    case "SET_DAYTIME":
      return {
        ...state,
        game: { ...state.game, isDaytime: action.payload },
      };

    case "SET_SCENE_TAG":
      return {
        ...state,
        game: { ...state.game, sceneTag: action.payload },
      };

    case "SET_TTS_PLAYING":
      return {
        ...state,
        game: { ...state.game, ttsPlaying: action.payload },
      };

    case "INCREMENT_ROUND":
      return {
        ...state,
        game: { ...state.game, roundNumber: state.game.roundNumber + 1 },
      };

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.payload],
      };

    case "UPDATE_MEMORY": {
      const newMemory = { ...state.memory };
      if (action.payload.keyFacts) {
        const merged: KeyFacts = { ...newMemory.keyFacts };
        const incoming = action.payload.keyFacts;
        for (const key of Object.keys(merged) as Array<keyof KeyFacts>) {
          if (incoming[key] && incoming[key].length > 0) {
            merged[key] = [
              ...new Set([...merged[key], ...incoming[key]]),
            ];
          }
        }
        newMemory.keyFacts = merged;
      }
      if (action.payload.storySummaries) {
        newMemory.storySummaries = [
          ...newMemory.storySummaries,
          ...action.payload.storySummaries,
        ];
      }
      if (action.payload.lastSummarizedRound !== undefined) {
        newMemory.lastSummarizedRound = action.payload.lastSummarizedRound;
      }
      return { ...state, memory: newMemory };
    }

    case "CLEAR_MESSAGES":
      return { ...state, messages: [] };

    case "LOAD_STATE":
      return { ...state, ...action.payload };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

/**
 * 取得最近 N 輪對話
 */
export function getRecentHistory(
  messages: ChatMessage[],
  rounds: number = 8
): ChatMessage[] {
  // 每輪 = 一組 user + assistant
  const pairs: ChatMessage[][] = [];
  let current: ChatMessage[] = [];

  for (const msg of messages) {
    current.push(msg);
    if (msg.role === "assistant") {
      pairs.push(current);
      current = [];
    }
  }
  if (current.length > 0) pairs.push(current);

  const recent = pairs.slice(-rounds);
  return recent.flat();
}
