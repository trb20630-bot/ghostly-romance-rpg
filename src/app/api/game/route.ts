import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/game — 建立新遊戲
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId, slotNumber, playerAge, playerGender, playerOccupation, chosenCharacter } = body;

    const supabase = getSupabaseAdmin();

    // 建立遊戲 session
    const { data: session, error: sessionError } = await supabase
      .from("game_sessions")
      .upsert(
        {
          player_id: playerId,
          slot_number: slotNumber || 1,
          player_age: playerAge,
          player_gender: playerGender,
          player_occupation: playerOccupation,
          chosen_character: chosenCharacter,
          phase: "death",
          round_number: 0,
          current_location: "現代",
          is_daytime: true,
        },
        { onConflict: "player_id,slot_number" }
      )
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 初始化記憶
    await supabase.from("player_memory").upsert(
      {
        session_id: session.id,
        key_facts: {
          enemies: [],
          allies: [],
          promises: [],
          secrets: [],
          kills: [],
          learned_skills: [],
          visited_places: [],
          important_items: [],
        },
        story_summaries: [],
        last_summarized_round: 0,
      },
      { onConflict: "session_id" }
    );

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Game API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/game — 更新遊戲狀態
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, ...updates } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("game_sessions")
      .update(updates)
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error("Game update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "伺服器錯誤" },
      { status: 500 }
    );
  }
}
