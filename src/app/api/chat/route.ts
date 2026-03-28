import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { assemblePrompt } from "@/lib/prompts";
import { logTokenUsage } from "@/lib/token-logger";
import { validateContextBeforeAI } from "@/lib/context-guard";
import { validateAndFixResponse } from "@/lib/validateResponse";
import { getNpcNames } from "@/lib/prompts/characters";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";
import { parseGameData, updatePlayerStats } from "@/lib/game-data-parser";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export const runtime = "nodejs";

// 版本標記 — 用於確認 Vercel 部署的程式碼版本
const CHAT_API_VERSION = "2026-03-28-v6-simple-tags";

/**
 * 從 AI 回覆中偵測日夜變化關鍵詞
 * 回傳 true = 天亮, false = 入夜, undefined = 無變化
 */
function detectTimeChange(text: string, currentIsDaytime: boolean): boolean | undefined {
  const dayKeywords = /天亮|日出|晨光|破曉|清晨|旭日|朝陽|天色漸明|曙光/;
  const nightKeywords = /入夜|天黑|夜幕|黃昏|日落|暮色|月色|夜深|天色漸暗|夜色/;

  if (currentIsDaytime && nightKeywords.test(text)) return false;
  if (!currentIsDaytime && dayKeywords.test(text)) return true;
  return undefined;
}

/** 已知遊戲地點（避免誤判）*/
const KNOWN_LOCATIONS = ["現代", "輪迴", "金華城", "蘭若寺", "蘭若寺地下", "墓地"];

/**
 * 從 AI 回覆中偵測地點變化
 * 回傳新地點名稱，或 null = 無變化
 */
function detectLocationChange(text: string, currentLocation: string): string | null {
  // 優先：精確匹配已知地點
  for (const loc of KNOWN_LOCATIONS) {
    if (loc === currentLocation) continue;
    const pattern = new RegExp(`(?:來到|踏入|進入|抵達|走進|走入|回到|到了)(?:了)?${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    if (pattern.test(text)) return loc;
  }
  return null;
}

/**
 * 從 AI 回覆中偵測階段轉換
 * death → reincarnation → story → ending
 */
function detectPhaseTransition(text: string, currentPhase: string): string | null {
  if (currentPhase === "death") {
    if (/輪迴|轉生|投胎|靈魂.*穿越|穿越.*古代|醒來.*發現|睜開眼.*古/.test(text)) {
      return "reincarnation";
    }
  }
  if (currentPhase === "reincarnation") {
    if (/你就是.*[聶寧]|成為了.*[聶寧]|轉生為|以.*身分/.test(text)) {
      return "story";
    }
  }
  if (currentPhase === "story") {
    if (/最終決戰|終局|大結局|故事.*落幕|救出.*小倩|脫離.*姥姥/.test(text)) {
      return "ending";
    }
  }
  return null;
}

interface ChatRequestBody {
  message: string;
  gameState: GameState;
  memory: PlayerMemory | null;
  recentHistory: ChatMessage[];
  playerId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();
    const { message, gameState, memory, recentHistory } = body;

    // JWT 驗證（向後相容：無 token 時用 body.playerId）
    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) {
      return unauthorizedResponse();
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: "訊息不能為空" }, { status: 400 });
    }

    // Context 組合前驗證：去重、排序、型別安全
    const validated = validateContextBeforeAI(
      recentHistory.filter((m) => m.role !== "system").map((m) => ({
        role: m.role,
        content: m.content,
      })),
      memory ? {
        keyFacts: memory.keyFacts as unknown as Record<string, string[]>,
        storySummaries: memory.storySummaries,
      } : null
    );

    // 組裝 Prompt（含分層載入 + 記憶注入），用驗證後的記憶
    const validatedMemory: PlayerMemory | null = memory ? {
      keyFacts: validated.keyFacts as unknown as PlayerMemory["keyFacts"],
      storySummaries: validated.summaries,
      lastSummarizedRound: memory.lastSummarizedRound,
    } : null;

    const validatedHistory: ChatMessage[] = validated.recentHistory.map((m, i) => ({
      id: String(i),
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
    }));

    const { systemBlocks, model, messages } = assemblePrompt(
      gameState,
      message,
      validatedMemory,
      validatedHistory
    );

    // 確保訊息列最後一條是當前玩家訊息（避免重複）
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== message) {
      messages.push({ role: "user", content: message });
    }

    // 呼叫 Claude（使用 content blocks 格式，支援 prompt caching）
    const result = await callClaude(systemBlocks, messages, model);

    // === GAME_DATA 診斷 ===
    console.log(`[GAME_DATA][${CHAT_API_VERSION}] Round ${gameState.roundNumber + 1}`);
    console.log(`[GAME_DATA] AI 原始回覆前 300 字: ${JSON.stringify(result.text.slice(0, 300))}`);
    console.log(`[GAME_DATA] AI 原始回覆後 300 字: ${JSON.stringify(result.text.slice(-300))}`);

    const hasOpenTag = result.text.includes("[GAME_DATA]");
    const hasCloseTag = result.text.includes("[/GAME_DATA]");
    console.log(`[GAME_DATA] 含 [GAME_DATA] 開啟標記: ${hasOpenTag} | 含 [/GAME_DATA] 關閉標記: ${hasCloseTag}`);

    // 先解析 GAME_DATA（必須在 validateAndFixResponse 之前）
    const { cleanResponse, gameData } = parseGameData(result.text);
    result.text = cleanResponse;

    if (gameData) {
      console.log(`[GAME_DATA] 解析成功: ${JSON.stringify(gameData)}`);
    } else if (hasOpenTag) {
      console.log("[GAME_DATA] 有標記但無有效變動（空區塊或格式錯誤）");
    } else {
      console.log("[GAME_DATA] AI 未輸出 [GAME_DATA] 標記");
    }

    // 如果有 GAME_DATA，fire-and-forget 寫入資料庫
    if (gameData && gameState.sessionId) {
      void updatePlayerStats(gameState.sessionId, gameData, gameState.roundNumber + 1)
        .then((r) => console.log(`[GAME_DATA] DB 寫入: ${r.ok ? "成功" : `失敗: ${r.error}`} | session: ${gameState.sessionId}`));
    }

    // 取得當前場景 NPC 名單（用於選項生成）
    const sceneNpcs = gameState.player?.character
      ? getNpcNames(gameState.player.character, gameState.currentLocation)
      : undefined;

    // 驗證回應：確保有完整的玩家引導選項（含 NPC 上下文）
    result.text = validateAndFixResponse(result.text, {
      location: gameState.currentLocation,
      phase: gameState.phase,
      npcs: sceneNpcs,
      truncated: result.truncated,
    });

    // 偵測日夜 / 地點 / 階段變化
    const newIsDaytime = detectTimeChange(result.text, gameState.isDaytime);
    const newLocation = detectLocationChange(result.text, gameState.currentLocation);
    const newPhase = detectPhaseTransition(result.text, gameState.phase);

    // Token 監控（fire-and-forget，含 cache 統計）
    void logTokenUsage({
      sessionId: gameState.sessionId,
      playerId: playerId || null,
      roundNumber: gameState.roundNumber,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheCreationInputTokens: result.cacheCreationInputTokens,
      cacheReadInputTokens: result.cacheReadInputTokens,
      model,
      endpoint: "chat",
    });

    return NextResponse.json({
      message: result.text,
      model,
      _v: CHAT_API_VERSION,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheCreationInputTokens: result.cacheCreationInputTokens,
      cacheReadInputTokens: result.cacheReadInputTokens,
      ...(newIsDaytime !== undefined && { isDaytime: newIsDaytime }),
      ...(newLocation && { location: newLocation }),
      ...(newPhase && { phase: newPhase }),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
