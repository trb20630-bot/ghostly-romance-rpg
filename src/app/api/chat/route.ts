import { NextRequest, NextResponse } from "next/server";
import { callClaude, validateChoicesWithHaiku, regenerateChoicesWithHaiku } from "@/lib/claude";
import { assemblePrompt } from "@/lib/prompts";
import { logTokenUsage } from "@/lib/token-logger";
import { validateContextBeforeAI } from "@/lib/context-guard";
import { validateAndFixResponse, extractChoiceTexts, injectChoices, hasPlayerChoices } from "@/lib/validateResponse";
import { getNpcNames } from "@/lib/prompts/characters";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";
import { parseGameData, updatePlayerStats } from "@/lib/game-data-parser";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export const runtime = "nodejs";

// 版本標記 — 用於確認 Vercel 部署的程式碼版本
const CHAT_API_VERSION = "2026-03-29-v8-haiku-choice-check";
const DEBUG = process.env.NODE_ENV === "development";

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
const KNOWN_LOCATIONS = [
  // 現代
  "現代", "輪迴",
  // 核心地點
  "金華城", "蘭若寺", "蘭若寺地下", "墓地",
  // 擴展地點
  "杭州", "溫州", "衢州", "紹興", "蘇州", "南京",
  "北京", "盛京", "遼東", "遼東半島", "金州",
  // 通用地點
  "客棧", "酒樓", "集市", "碼頭", "山路", "官道", "村莊", "城門",
];

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
function detectPhaseTransition(text: string, currentPhase: string, roundNumber?: number): string | null {
  if (currentPhase === "death") {
    if (/輪迴|轉生|投胎|靈魂.*穿越|穿越.*古代|醒來.*發現|睜開眼.*古/.test(text)) {
      return "reincarnation";
    }
    // 後備：death 超過 15 輪自動推進
    if (roundNumber && roundNumber > 15) {
      console.log("[Phase] 後備觸發：death 超過 15 輪，自動推進到 reincarnation");
      return "reincarnation";
    }
  }
  if (currentPhase === "reincarnation") {
    // 更寬鬆的偵測：支援自訂角色名和各種轉生描述
    if (/你就是|成為了|轉生為|以.*身分|你現在是|你醒來.*古|發現自己.*在.*[城寺鎮村]|你的新身分|你的新生/.test(text)) {
      return "story";
    }
    // 後備：reincarnation 超過 5 輪自動推進
    if (roundNumber && roundNumber > 5) {
      console.log("[Phase] 後備觸發：reincarnation 超過 5 輪，自動推進到 story");
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

    // 先解析 GAME_DATA（必須在 validateAndFixResponse 之前）
    const { cleanResponse, gameData } = parseGameData(result.text);
    result.text = cleanResponse;

    if (DEBUG) {
      const hasTag = result.text.includes("[GAME_DATA]");
      console.log(`[GAME_DATA][${CHAT_API_VERSION}] Round ${gameState.roundNumber + 1} | tag: ${hasTag} | parsed: ${!!gameData}`);
    }

    // 如果有 GAME_DATA，fire-and-forget 寫入資料庫
    if (gameData && gameState.sessionId) {
      void updatePlayerStats(gameState.sessionId, gameData, gameState.roundNumber + 1)
        .then((r) => { if (!r.ok) console.warn(`[GAME_DATA] DB 寫入失敗: ${r.error}`); });
    }

    // 取得當前場景 NPC 名單（用於選項生成）
    const sceneNpcs = gameState.player?.character
      ? getNpcNames(gameState.player.character, gameState.currentLocation)
      : undefined;

    // 驗證回應：檢查選項完整性（不再注入硬編碼後備）
    const validation = validateAndFixResponse(result.text, {
      location: gameState.currentLocation,
      phase: gameState.phase,
      npcs: sceneNpcs,
      truncated: result.truncated,
    });

    result.text = validation.text;
    const characterName = gameState.player?.characterName || gameState.player?.character || "玩家";

    // Haiku 選項品質檢查流程
    if (validation.needsChoiceCheck) {
      const existingChoices = extractChoiceTexts(result.text);

      if (existingChoices && !validation.choiceIssue) {
        // 有選項但需要品質檢查
        const choiceArray = [existingChoices.a, existingChoices.b, existingChoices.c];
        const check = await validateChoicesWithHaiku(
          choiceArray,
          validation.narrative,
          characterName,
          gameState.currentLocation
        );

        if (!check.valid) {
          console.log(`[Chat] Haiku 判定選項不合格: ${check.reason}`);
          const newChoices = await regenerateChoicesWithHaiku(
            validation.narrative,
            characterName,
            gameState.currentLocation,
            check.reason || "選項與劇情無關"
          );
          if (newChoices.length >= 3) {
            console.log("[Chat] Haiku 已重新生成選項");
            result.text = injectChoices(validation.narrative, newChoices);
          } else {
            console.warn("[Chat] Haiku 重新生成失敗，保留原選項");
          }
        } else {
          if (DEBUG) console.log("[Chat] Haiku 選項品質檢查通過");
        }
      } else {
        // 選項缺失/截斷/極端 → 直接用 Haiku 生成
        console.log(`[Chat] 選項${validation.choiceIssue || "缺失"}，Haiku 生成中...`);
        const newChoices = await regenerateChoicesWithHaiku(
          validation.narrative,
          characterName,
          gameState.currentLocation,
          validation.choiceIssue === "truncated"
            ? "回應被截斷，選項不完整"
            : validation.choiceIssue === "extreme"
            ? "原選項為無效填充文字"
            : "AI 未產出選項"
        );
        if (newChoices.length >= 3) {
          console.log("[Chat] Haiku 已生成選項");
          result.text = injectChoices(validation.narrative, newChoices);
        } else {
          console.warn("[Chat] Haiku 生成失敗，回應將無選項");
        }
      }
    }

    // 偵測日夜 / 地點 / 階段變化
    const newIsDaytime = detectTimeChange(result.text, gameState.isDaytime);
    const newLocation = detectLocationChange(result.text, gameState.currentLocation);
    const newPhase = detectPhaseTransition(result.text, gameState.phase, gameState.roundNumber);

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
