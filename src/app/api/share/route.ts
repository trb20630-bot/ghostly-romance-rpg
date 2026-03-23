import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** POST /api/share */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // ===== Quick share: create story_exports + set public in one step =====
    if (action === "quick_share") {
      const { sessionId, playerId, title, conversations, character, isAnonymous } = body;

      if (!sessionId || !playerId || !title) {
        return NextResponse.json({ error: "缺少參數" }, { status: 400 });
      }

      const supabase = db();

      // Verify session belongs to player
      const { data: session } = await supabase
        .from("game_sessions")
        .select("player_id")
        .eq("id", sessionId)
        .single();

      if (!session || session.player_id !== playerId) {
        return NextResponse.json({ error: "無權限" }, { status: 403 });
      }

      // Build chapters from raw conversations — clean game artifacts
      const convs: Array<{ role: string; content: string; phase: string }> = conversations || [];
      const chapters: Array<{ number: number; title: string; content: string }> = [];
      const phaseNames: Record<string, string> = {
        death: "序章：現代的終結",
        reincarnation: "楔子：輪迴",
        story: "主線故事",
        ending: "終章",
      };

      const grouped: Record<string, string[]> = {};
      for (const c of convs) {
        const phase = c.phase || "story";
        if (!grouped[phase]) grouped[phase] = [];
        if (c.role === "assistant") {
          grouped[phase].push(cleanStoryText(c.content));
        }
      }

      let num = 0;
      for (const [phase, contents] of Object.entries(grouped)) {
        num++;
        chapters.push({
          number: num,
          title: phaseNames[phase] || `第${num}章`,
          content: contents.join("\n\n"),
        });
      }

      const totalWords = chapters.reduce((s, c) => s + c.content.length, 0);

      // Insert story_exports with is_public = true
      const { data: inserted, error } = await supabase
        .from("story_exports")
        .insert({
          session_id: sessionId,
          title,
          chapters,
          total_words: totalWords,
          format: "markdown",
          is_public: true,
          is_anonymous: isAnonymous === true,
        })
        .select("id")
        .single();

      if (error) throw error;

      return NextResponse.json({ ok: true, storyId: inserted?.id });
    }

    // ===== Toggle public/private for existing story =====
    const { storyId, playerId, isPublic, isAnonymous } = body;
    if (!storyId || !playerId) {
      return NextResponse.json({ error: "缺少參數" }, { status: 400 });
    }

    const supabase = db();

    const { data: story } = await supabase
      .from("story_exports")
      .select("id, session_id")
      .eq("id", storyId)
      .single();

    if (!story) return NextResponse.json({ error: "找不到作品" }, { status: 404 });

    const { data: session } = await supabase
      .from("game_sessions")
      .select("player_id")
      .eq("id", story.session_id)
      .single();

    if (!session || session.player_id !== playerId) {
      return NextResponse.json({ error: "無權限" }, { status: 403 });
    }

    const { error } = await supabase
      .from("story_exports")
      .update({
        is_public: isPublic !== false,
        is_anonymous: isAnonymous === true,
      })
      .eq("id", storyId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Share API error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "分享失敗" }, { status: 500 });
  }
}

/** Clean game artifacts from AI text for story display */
function cleanStoryText(text: string): string {
  return text
    // Remove option lines: > A) ... / > B) ... / A）... / B）...
    .replace(/^>\s*[A-Da-d][)）].*/gm, "")
    // Remove "或者，你也可以自由描述..." prompts
    .replace(/^>\s*或者.*/gm, "")
    // Remove bare > lines
    .replace(/^>\s*$/gm, "")
    // Remove **bold** markers → keep text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove * italic * markers → keep text
    .replace(/\*([^*]+)\*/g, "$1")
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
