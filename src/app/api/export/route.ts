import { NextRequest } from "next/server";
import { callClaude } from "@/lib/claude";
import { logTokenUsage } from "@/lib/token-logger";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback } from "@/lib/auth-guard";

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

/**
 * POST /api/export
 * 串流回傳進度 — 每完成一章就傳送進度 + 章節內容
 *
 * 串流格式（每行一個事件，用換行分隔）：
 *   [PROGRESS] 1/5 正在改寫：序章：現代的終結
 *   [CHAPTER] 1|序章：現代的終結|<小說內容>
 *   [PROGRESS] 2/5 正在改寫：楔子：輪迴
 *   [CHAPTER] 2|楔子：輪迴|<小說內容>
 *   ...
 *   [DONE] {"title":"...","totalWords":1234,"exportedAt":"..."}
 *   [ERROR] 錯誤訊息
 */
export async function POST(request: NextRequest) {
  let body: ExportRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response("[ERROR] 無效的請求格式", { status: 400 });
  }

  const { conversations, playerProfile, sessionId } = body;

  const playerId = await authenticateOrFallback(request, body.playerId);
  if (!playerId) {
    return new Response("[ERROR] 未授權，請重新登入", { status: 401 });
  }

  if (!conversations || conversations.length === 0) {
    return new Response("[ERROR] 無對話紀錄", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(line: string) {
        controller.enqueue(encoder.encode(line + "\n"));
      }

      try {
        const pronoun = playerProfile.character === "聶小倩" ? "她" : "他";
        const phases = groupByPhase(conversations);

        // 預先計算總章節數
        const chunkSize = 8;
        const allChunks: Array<{ title: string; convs: Array<{ role: string; content: string }> }> = [];
        const chapterNames: Record<string, string> = {
          death: "序章：現代的終結",
          reincarnation: "楔子：輪迴",
          story: "",
          ending: "終章",
        };

        let chapterNum = 0;
        for (const [phase, convs] of Object.entries(phases)) {
          if (convs.length === 0) continue;
          const needsChunking = convs.length > chunkSize;
          const chunks = needsChunking ? splitIntoChunks(convs, chunkSize) : [convs];

          for (const chunk of chunks) {
            chapterNum++;
            const title = needsChunking
              ? `第${chapterNum}章`
              : (chapterNames[phase] || `第${chapterNum}章`);
            allChunks.push({ title, convs: chunk });
          }
        }

        const totalChapters = allChunks.length;
        send(`[TOTAL] ${totalChapters}`);
        const chapters: Array<{ number: number; title: string; content: string }> = [];

        for (let i = 0; i < allChunks.length; i++) {
          const { title, convs } = allChunks[i];
          send(`[PROGRESS] ${i + 1}/${totalChapters}|${title}`);

          try {
            const result = await callClaude(
              CHAPTER_PROMPT,
              [{
                role: "user",
                content: `角色：${playerProfile.character}（用「${pronoun}」稱呼）\n轉生前身份：${playerProfile.age}歲${playerProfile.occupation}\n\n請將以下對話完整改寫為小說章節「${title}」，不可遺漏任何情節：\n\n${formatConvs(convs)}`,
              }],
              "haiku",
              4096
            );

            chapters.push({ number: i + 1, title, content: result.text });
            // 用 | 分隔欄位，內容中的換行用 \\n 轉義
            send(`[CHAPTER] ${i + 1}|${title}|${result.text.replace(/\n/g, "\\n")}`);

            void logTokenUsage({
              sessionId: sessionId || null,
              playerId: playerId || null,
              roundNumber: i + 1,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              model: "haiku",
              endpoint: "chat",
            });
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : "未知錯誤";
            send(`[CHAPTER_ERROR] ${i + 1}|${title}|${errMsg}`);
            chapters.push({ number: i + 1, title, content: `（此章節改寫失敗：${errMsg}）` });
          }
        }

        // 儲存到資料庫
        const characterName = playerProfile.character === "聶小倩" ? "聶小倩" : "寧采臣";
        const title = `那些關於我轉生成為${characterName}的那件事`;
        const totalWords = chapters.reduce((sum, ch) => sum + ch.content.length, 0);
        let storyExportId: string | null = null;

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
            if (inserted) storyExportId = inserted.id;
          } catch {
            // 儲存失敗不影響匯出
          }
        }

        send(`[DONE] ${title}|${totalWords}|${chapters.length}|${storyExportId || ""}`);
      } catch (e) {
        send(`[ERROR] ${e instanceof Error ? e.message : "匯出失敗"}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
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
