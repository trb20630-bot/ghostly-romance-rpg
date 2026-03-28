import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** POST /api/like — Toggle like（需認證） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storyId } = body;

    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) return unauthorizedResponse();

    if (!storyId) {
      return NextResponse.json({ error: "缺少 storyId" }, { status: 400 });
    }

    const supabase = db();

    // Check if already liked
    const { data: existing } = await supabase
      .from("story_likes")
      .select("story_id")
      .eq("story_id", storyId)
      .eq("user_id", playerId)
      .maybeSingle();

    if (existing) {
      // Unlike
      await supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", playerId);
      const { data: story } = await supabase.from("story_exports").select("likes_count").eq("id", storyId).single();
      if (story) {
        await supabase.from("story_exports").update({ likes_count: Math.max(0, (story.likes_count || 0) - 1) }).eq("id", storyId);
      }
      return NextResponse.json({ liked: false });
    } else {
      // Like
      await supabase.from("story_likes").insert({ story_id: storyId, user_id: playerId });
      const { data: story } = await supabase.from("story_exports").select("likes_count, views_count").eq("id", storyId).single();
      if (story) {
        await supabase.from("story_exports").update({
          likes_count: ((story.likes_count as number) || 0) + 1,
          views_count: ((story.views_count as number) || 0) + 1,
        }).eq("id", storyId);
      }
      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "失敗" }, { status: 500 });
  }
}
