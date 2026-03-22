import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { assemblePrompt } from "@/lib/prompts";
import type { GameState, PlayerMemory, ChatMessage } from "@/types/game";

export const runtime = "nodejs";

interface ChatRequestBody {
  message: string;
  gameState: GameState;
  memory: PlayerMemory | null;
  recentHistory: ChatMessage[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json();
    const { message, gameState, memory, recentHistory } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "訊息不能為空" }, { status: 400 });
    }

    // 組裝 Prompt（含分層載入 + 記憶注入）
    const { systemPrompt, model, messages } = assemblePrompt(
      gameState,
      message,
      memory,
      recentHistory
    );

    // 加入當前玩家訊息
    messages.push({ role: "user", content: message });

    // 呼叫 Claude
    const result = await callClaude(systemPrompt, messages, model);

    return NextResponse.json({
      message: result.text,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
