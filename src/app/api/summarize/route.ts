import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { summarizeWithHaiku, extractFactsWithHaiku } from "@/lib/claude";
import { SUMMARY_PROMPT, EXTRACT_FACTS_PROMPT } from "@/lib/prompts";
import { logTokenUsage } from "@/lib/token-logger";

export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * 嘗試修復被截斷的 JSON（補上缺少的括號）
 */
export function tryRepairJson(raw: string): Record<string, unknown> | null {
  // 計算未閉合的括號
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of raw) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  // 如果在字串中被截斷，先關閉字串
  let fixed = raw;
  if (inString) fixed += '"';

  // 補上缺少的 ] 和 }
  for (let i = 0; i < brackets; i++) fixed += "]";
  for (let i = 0; i < braces; i++) fixed += "}";

  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/**
 * POST /api/summarize — 用 Haiku 生成摘要 + 提取關鍵事實，並持久化到 DB
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversations, startRound, endRound, sessionId, playerId } = body;

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
    const [summaryResult, factsResult] = await Promise.all([
      summarizeWithHaiku(
        SUMMARY_PROMPT,
        `以下是第 ${startRound} 到第 ${endRound} 輪的對話：\n\n${conversationText}`
      ),
      extractFactsWithHaiku(
        EXTRACT_FACTS_PROMPT,
        `以下是最新的對話：\n\n${conversationText}`
      ),
    ]);

    // Token 監控（fire-and-forget）
    void logTokenUsage({
      sessionId: sessionId || null,
      playerId: playerId || null,
      roundNumber: endRound,
      inputTokens: summaryResult.inputTokens,
      outputTokens: summaryResult.outputTokens,
      model: "haiku",
      endpoint: "summarize",
    });
    void logTokenUsage({
      sessionId: sessionId || null,
      playerId: playerId || null,
      roundNumber: endRound,
      inputTokens: factsResult.inputTokens,
      outputTokens: factsResult.outputTokens,
      model: "haiku",
      endpoint: "extract_facts",
    });

    // 解析事實 JSON（含截斷修復）
    let facts = null;
    const jsonMatch = factsResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const rawJson = jsonMatch[0];
      try {
        facts = JSON.parse(rawJson);
      } catch {
        // JSON 可能被 token 限制截斷，嘗試修復
        console.warn("[extractFacts] JSON parse failed, attempting repair...");
        const repaired = tryRepairJson(rawJson);
        if (repaired) {
          facts = repaired;
          console.log("[extractFacts] JSON was truncated, fixed successfully");
        } else {
          console.warn("[extractFacts] JSON repair failed, raw:", rawJson.slice(0, 300));
        }
      }
    } else {
      console.warn("[extractFacts] No JSON found in response:", factsResult.text.slice(0, 200));
    }

    const summaryText = `第${startRound}-${endRound}輪：${summaryResult.text}`;

    // 持久化記憶到 Supabase（合併既有記憶）
    if (sessionId) {
      try {
        const supabase = getSupabase();

        // 先讀取現有記憶
        const { data: existingMemory } = await supabase
          .from("player_memory")
          .select("key_facts, story_summaries")
          .eq("session_id", sessionId)
          .maybeSingle();

        const existingFacts = (existingMemory?.key_facts as Record<string, string[]>) || {
          enemies: [], allies: [], promises: [], secrets: [],
          kills: [], learned_skills: [], visited_places: [], important_items: [],
        };
        const existingSummaries = (existingMemory?.story_summaries as string[]) || [];

        // 合併新事實（去重）
        const mergedFacts = { ...existingFacts };
        if (facts) {
          const factMapping: Record<string, string> = {
            new_enemies: "enemies",
            new_allies: "allies",
            new_promises: "promises",
            new_secrets: "secrets",
            new_kills: "kills",
            new_items: "important_items",
            new_places: "visited_places",
          };
          for (const [newKey, existKey] of Object.entries(factMapping)) {
            if (facts[newKey] && Array.isArray(facts[newKey]) && facts[newKey].length > 0) {
              mergedFacts[existKey] = [...new Set([...(mergedFacts[existKey] || []), ...facts[newKey]])];
            }
          }
        }

        // 追加新摘要
        const mergedSummaries = [...existingSummaries, summaryText];

        await supabase
          .from("player_memory")
          .upsert(
            {
              session_id: sessionId,
              key_facts: mergedFacts,
              story_summaries: mergedSummaries,
              last_summarized_round: endRound,
            },
            { onConflict: "session_id" }
          );
      } catch (dbErr) {
        console.error("Failed to persist memory to DB:", dbErr);
        // 不阻斷回應，前端仍有 client-side 記憶
      }
    }

    return NextResponse.json({
      summary: summaryText,
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
