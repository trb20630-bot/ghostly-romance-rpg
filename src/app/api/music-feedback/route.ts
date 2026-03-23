import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * POST /api/music-feedback — 玩家回報音樂問題
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, playerId, currentScene, currentMusic, recentDialogue, feedback } = body;

    if (!feedback?.trim()) {
      return NextResponse.json({ error: "請描述問題" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from("music_feedback").insert({
      session_id: sessionId || null,
      player_id: playerId || null,
      current_scene: currentScene || null,
      current_music: currentMusic || null,
      recent_dialogue: recentDialogue || null,
      player_feedback: feedback.trim().slice(0, 500),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "回報失敗" },
      { status: 500 }
    );
  }
}
