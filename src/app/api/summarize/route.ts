import { NextRequest, NextResponse } from "next/server";
import { summarizeWithHaiku, extractFactsWithHaiku } from "@/lib/claude";
import { SUMMARY_PROMPT, EXTRACT_FACTS_PROMPT } from "@/lib/prompts";

export const runtime = "nodejs";

/**
 * POST /api/summarize — 用 Haiku 生成摘要 + 提取關鍵事實
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversations, startRound, endRound } = body;

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: "缺少對話內容" }, { status: 400 });
    }

    // 組裝對話文本
    const conversationText = conversations
      .map(
        (c: { role: string; content: string }) =>
          `${c.role === "user" ? "玩家" : "AI"}：${c.content}`
      )
      .join("\n");

    // 並行處理：摘要 + 提取事實
    const [summary, factsRaw] = await Promise.all([
      summarizeWithHaiku(
        SUMMARY_PROMPT,
        `以下是第 ${startRound} 到第 ${endRound} 輪的對話：\n\n${conversationText}`
      ),
      extractFactsWithHaiku(
        EXTRACT_FACTS_PROMPT,
        `以下是最新的對話：\n\n${conversationText}`
      ),
    ]);

    // 解析事實 JSON
    let facts = null;
    try {
      const jsonMatch = factsRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        facts = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.warn("Failed to parse facts JSON:", factsRaw);
    }

    return NextResponse.json({
      summary: `第${startRound}-${endRound}輪：${summary}`,
      facts,
    });
  } catch (error) {
    console.error("Summarize API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "摘要生成失敗" },
      { status: 500 }
    );
  }
}
