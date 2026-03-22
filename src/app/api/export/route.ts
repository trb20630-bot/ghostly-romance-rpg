import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";

export const runtime = "nodejs";

const CHAPTER_PROMPT = `你是一個小說編輯。你的任務是將以下遊戲對話紀錄改寫成一篇流暢的小說章節。

規則：
1. 移除所有選項提示和遊戲機制相關文字
2. 將第二人稱（「你」）轉為第一人稱（「我」）或第三人稱（根據角色）
3. 保留所有重要對話，但改為小說對話格式
4. 加入必要的心理描寫和場景過渡
5. 保持古典文風
6. 每章 800-1500 字

請直接輸出小說文本，不要加任何說明。`;

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
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequestBody = await request.json();
    const { conversations, playerProfile } = body;

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: "無對話紀錄" }, { status: 400 });
    }

    // 按階段分組對話
    const phases = groupByPhase(conversations);

    // 為每個階段生成章節
    const chapters = [];
    const chapterNames: Record<string, string> = {
      death: "序章：現代的終結",
      reincarnation: "楔子：輪迴",
      story: "", // 根據內容動態命名
      ending: "終章",
    };

    let chapterNum = 0;

    for (const [phase, convs] of Object.entries(phases)) {
      if (convs.length === 0) continue;

      const convText = convs
        .map(
          (c: { role: string; content: string }) =>
            `${c.role === "user" ? "【玩家】" : "【AI】"}${c.content}`
        )
        .join("\n\n");

      // 故事階段可能需要拆分為多個章節
      if (phase === "story" && convs.length > 30) {
        const chunkSize = 15;
        for (let i = 0; i < convs.length; i += chunkSize) {
          const chunk = convs.slice(i, i + chunkSize);
          const chunkText = chunk
            .map(
              (c: { role: string; content: string }) =>
                `${c.role === "user" ? "【玩家】" : "【AI】"}${c.content}`
            )
            .join("\n\n");

          chapterNum++;
          const result = await callClaude(
            CHAPTER_PROMPT,
            [
              {
                role: "user",
                content: `角色：${playerProfile.character}\n轉生前身份：${playerProfile.age}歲${playerProfile.occupation}\n\n以下是對話紀錄，請改寫為小說第${chapterNum}章：\n\n${chunkText}`,
              },
            ],
            "sonnet",
            2000
          );

          chapters.push({
            number: chapterNum,
            title: `第${chapterNum}章`,
            content: result.text,
          });
        }
      } else {
        chapterNum++;
        const result = await callClaude(
          CHAPTER_PROMPT,
          [
            {
              role: "user",
              content: `角色：${playerProfile.character}\n轉生前身份：${playerProfile.age}歲${playerProfile.occupation}\n\n以下是「${phase}」階段的對話紀錄，請改寫為小說章節「${chapterNames[phase] || `第${chapterNum}章`}」：\n\n${convText}`,
            },
          ],
          "sonnet",
          2000
        );

        chapters.push({
          number: chapterNum,
          title: chapterNames[phase] || `第${chapterNum}章`,
          content: result.text,
        });
      }
    }

    // 組裝完整小說
    const characterName =
      playerProfile.character === "聶小倩" ? "聶小倩" : "寧采臣";
    const title = `那些關於我轉生成為${characterName}的那件事`;

    const totalWords = chapters.reduce(
      (sum, ch) => sum + ch.content.length,
      0
    );

    const story = {
      title,
      chapters,
      totalWords,
      exportedAt: new Date().toISOString(),
    };

    return NextResponse.json(story);
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "匯出失敗" },
      { status: 500 }
    );
  }
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
