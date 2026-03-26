import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { assemblePrompt } from "@/lib/prompts";
import { logTokenUsage } from "@/lib/token-logger";
import { validateContextBeforeAI } from "@/lib/context-guard";
import { validateAndFixResponse } from "@/lib/validateResponse";
import { getNpcNames } from "@/lib/prompts/characters";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export const runtime = "nodejs";

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

    const { systemPrompt, model, messages } = assemblePrompt(
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

    // 呼叫 Claude
    const result = await callClaude(systemPrompt, messages, model);

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

    // 偵測日夜變化
    const newIsDaytime = detectTimeChange(result.text, gameState.isDaytime);

    // Token 監控（fire-and-forget）
    void logTokenUsage({
      sessionId: gameState.sessionId,
      playerId: playerId || null,
      roundNumber: gameState.roundNumber,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model,
      endpoint: "chat",
    });

    return NextResponse.json({
      message: result.text,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      ...(newIsDaytime !== undefined && { isDaytime: newIsDaytime }),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
