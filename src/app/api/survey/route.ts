import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/survey?playerId=xxx
 * 檢查玩家是否已填寫問卷
 */
export async function GET(request: NextRequest) {
  try {
    const playerId = await authenticateOrFallback(request);
    if (!playerId) return unauthorizedResponse();

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
    }

    const { data } = await supabase
      .from("survey_responses")
      .select("id")
      .eq("player_id", playerId)
      .maybeSingle();

    return NextResponse.json({ completed: !!data });
  } catch (error) {
    console.error("Survey GET error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}

/**
 * POST /api/survey
 * 提交問卷 + 獎勵 10 墨幣
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) return unauthorizedResponse();

    const {
      sessionId,
      overallRating,
      storyRating,
      aiQualityRating,
      optionCoherenceRating,
      characterRating,
      pacingRating,
      preferredGenres,
      preferredLength,
      suggestions,
    } = body;

    // 驗證必填欄位
    const ratings = [overallRating, storyRating, aiQualityRating, optionCoherenceRating, characterRating, pacingRating];
    if (ratings.some((r) => !r || r < 1 || r > 5)) {
      return NextResponse.json({ error: "評分必須在 1-5 之間" }, { status: 400 });
    }
    if (!Array.isArray(preferredGenres) || preferredGenres.length === 0 || preferredGenres.length > 3) {
      return NextResponse.json({ error: "請選擇 1-3 個偏好題材" }, { status: 400 });
    }
    if (!preferredLength) {
      return NextResponse.json({ error: "請選擇遊戲時長偏好" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "資料庫未設定" }, { status: 500 });
    }

    // 檢查是否已填寫
    const { data: existing } = await supabase
      .from("survey_responses")
      .select("id")
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "您已填寫過問卷", alreadyCompleted: true }, { status: 409 });
    }

    // 儲存問卷
    const { error: insertError } = await supabase
      .from("survey_responses")
      .insert({
        player_id: playerId,
        session_id: sessionId || null,
        overall_rating: overallRating,
        story_rating: storyRating,
        ai_quality_rating: aiQualityRating,
        option_coherence_rating: optionCoherenceRating,
        character_rating: characterRating,
        pacing_rating: pacingRating,
        preferred_genres: preferredGenres,
        preferred_length: preferredLength,
        suggestions: (suggestions || "").slice(0, 200),
      });

    if (insertError) {
      console.error("Survey insert error:", insertError);
      return NextResponse.json({ error: "儲存失敗" }, { status: 500 });
    }

    // 獎勵 10 墨幣
    let silverAwarded = false;
    if (sessionId) {
      const { data: stats } = await supabase
        .from("player_stats")
        .select("silver")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (stats) {
        await supabase
          .from("player_stats")
          .update({ silver: (stats.silver ?? 0) + 10 })
          .eq("session_id", sessionId);
        silverAwarded = true;
      } else {
        // 如果 player_stats 不存在，建立一筆
        await supabase
          .from("player_stats")
          .insert({ session_id: sessionId, silver: 10, items: [], followers: [], skills: [], relationships: {} });
        silverAwarded = true;
      }
    }

    return NextResponse.json({ success: true, silverAwarded });
  } catch (error) {
    console.error("Survey POST error:", error);
    return NextResponse.json({ error: "伺服器錯誤" }, { status: 500 });
  }
}
