import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SCENE_BGM: Record<string, string> = {
  MODERN: "Midnight In The Boardroom.mp3",
  DEATH: "Midnight In The Boardroom.mp3",
  REBIRTH: "Ethereal Ascent.mp3",
  LANRUO: "幽寺阴风.mp3",
  ROMANCE: "月影幽恋.mp3",
  BATTLE: "冥锋对决.mp3",
  ENDING: "余音不散.mp3",
};

/**
 * POST /api/music-log — 記錄音樂切換（fire-and-forget）
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, fromScene, toScene, aiSnippet, isAbnormal } = await request.json();

    if (!sessionId || !toScene) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await supabase.from("music_logs").insert({
      session_id: sessionId,
      from_scene: fromScene || null,
      to_scene: toScene,
      from_music: fromScene ? (SCENE_BGM[fromScene] || null) : null,
      to_music: SCENE_BGM[toScene] || null,
      ai_response_snippet: aiSnippet ? aiSnippet.slice(0, 200) : null,
      is_abnormal: isAbnormal || false,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
