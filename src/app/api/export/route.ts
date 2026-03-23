import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { logTokenUsage } from "@/lib/token-logger";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const CHAPTER_PROMPT = `你是一個小說編輯。將以下遊戲對話改寫成流暢的小說章節。

轉換規則：
1. 移除所有選項（A/B/C/D）和遊戲機制文字
2. 將玩家選擇融入敘事（「我選A」→「他決定...」或「她毅然...」）
3. 人稱一致：寧采臣用「他」，聶小倩用「她」
4. 加入場景轉換和環境描寫
5. 潤飾對話使其像小說
6. 保持古典文風
7. **必須完整改寫所有對話內容，不可省略任何情節或對話**
8. **不要截斷，確保每段情節都有完整的結尾**

直接輸出小說文本，不要加說明。`;

interface ExportRequestBody {
  conversations: Array<{
    round_number: number;
    role: string;
    content: string;
    phase: string;
  }>;
  playerProfile: {
    age: number;
    gender: string;
    occupation: string;
    character: string;
  };
  sessionId?: string;
  playerId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequestBody = await request.json();
    const { conversations, playerProfile, sessionId, playerId } = body;

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: "無對話紀錄" }, { status: 400 });
    }

    const pronoun = playerProfile.character === "聶小倩" ? "她" : "他";
    const phases = groupByPhase(conversations);

    const chapters = [];
    const chapterNames: Record<string, string> = {
      death: "序章：現代的終結",
      reincarnation: "楔子：輪迴",
      story: "",
      ending: "終章",
    };

    let chapterNum = 0;

    for (const [phase, convs] of Object.entries(phases)) {
      if (convs.length === 0) continue;

      // Smart chunking: split into chunks of ~8 messages to avoid token overflow
      // but ensure each chunk is small enough for thorough conversion
      const chunkSize = 8;
      const needsChunking = convs.length > chunkSize;
      const chunks = needsChunking
        ? splitIntoChunks(convs, chunkSize)
        : [convs];

      for (const chunk of chunks) {
        chapterNum++;
        const chapterTitle = needsChunking
          ? `第${chapterNum}章`
          : (chapterNames[phase] || `第${chapterNum}章`);

        const result = await callClaude(
          CHAPTER_PROMPT,
          [{
            role: "user",
            content: `角色：${playerProfile.character}（用「${pronoun}」稱呼）\n轉生前身份：${playerProfile.age}歲${playerProfile.occupation}\n\n請將以下對話完整改寫為小說章節「${chapterTitle}」，不可遺漏任何情節：\n\n${formatConvs(chunk)}`,
          }],
          "haiku",
          4096
        );

        void logTokenUsage({
          sessionId: sessionId || null,
          playerId: playerId || null,
          roundNumber: chapterNum,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          model: "haiku",
          endpoint: "chat",
        });

        chapters.push({
          number: chapterNum,
          title: chapterTitle,
          content: result.text,
        });
      }
    }

    const characterName = playerProfile.character === "聶小倩" ? "聶小倩" : "寧采臣";
    const title = `那些關於我轉生成為${characterName}的那件事`;
    const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);

    const story: Record<string, unknown> = { title, chapters, totalWords, exportedAt: new Date().toISOString() };

    // Save to story_exports table
    if (sessionId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: inserted } = await supabase.from("story_exports").insert({
          session_id: sessionId,
          title,
          chapters,
          total_words: totalWords,
          format: "markdown",
        }).select("id").single();

        if (inserted) {
          story.storyExportId = inserted.id;
        }
      } catch (e) {
        console.warn("Failed to save story export:", e);
      }
    }

    return NextResponse.json(story);
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "匯出失敗" },
      { status: 500 }
    );
  }
}

function splitIntoChunks<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function formatConvs(convs: Array<{ role: string; content: string }>): string {
  return convs
    .map((c) => `${c.role === "user" ? "【玩家】" : "【AI】"}${cleanSceneTag(c.content)}`)
    .join("\n\n");
}

function cleanSceneTag(text: string): string {
  return text.replace(/\s*<!-- SCENE: \w+ -->\s*/g, "").trim();
}

function groupByPhase(
  conversations: Array<{ phase: string; role: string; content: string }>
) {
  const groups: Record<string, Array<{ role: string; content: string }>> = {};
  for (const conv of conversations) {
    const phase = conv.phase || "story";
    if (!groups[phase]) groups[phase] = [];
    groups[phase].push({ role: conv.role, content: conv.content });
  }
  return groups;
}
