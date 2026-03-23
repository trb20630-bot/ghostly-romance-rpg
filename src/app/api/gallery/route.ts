import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** GET /api/gallery?sort=latest|popular&author=name */
export async function GET(request: NextRequest) {
  try {
    const sort = request.nextUrl.searchParams.get("sort") || "latest";
    const author = request.nextUrl.searchParams.get("author");
    const supabase = db();

    // Get public stories
    let query = supabase
      .from("story_exports")
      .select("id, session_id, title, chapters, total_words, likes_count, views_count, comments_count, is_anonymous, created_at")
      .eq("is_public", true);

    if (sort === "popular") {
      query = query.order("likes_count", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data: stories, error } = await query.limit(50);
    if (error) throw error;

    // Get session → player info for each story
    const sessionIds = [...new Set((stories || []).map((s) => s.session_id).filter(Boolean))];
    const { data: sessions } = await supabase
      .from("game_sessions")
      .select("id, player_id, chosen_character, character_name")
      .in("id", sessionIds.length > 0 ? sessionIds : ["__none__"]);

    const playerIds = [...new Set((sessions || []).map((s) => s.player_id).filter(Boolean))];
    const { data: players } = await supabase
      .from("players")
      .select("id, name")
      .in("id", playerIds.length > 0 ? playerIds : ["__none__"]);

    // Build lookup maps
    const sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
    const playerMap = new Map((players || []).map((p) => [p.id, p]));

    let result = (stories || []).map((s) => {
      const sess = sessionMap.get(s.session_id);
      const player = sess ? playerMap.get(sess.player_id) : null;
      return {
        id: s.id,
        title: s.title,
        totalWords: s.total_words,
        chapterCount: Array.isArray(s.chapters) ? s.chapters.length : 0,
        character: sess?.chosen_character || null,
        characterName: sess?.character_name || null,
        authorName: s.is_anonymous ? "匿名" : (player?.name || "未知"),
        authorId: s.is_anonymous ? null : player?.name,
        likesCount: s.likes_count || 0,
        viewsCount: s.views_count || 0,
        commentsCount: s.comments_count || 0,
        createdAt: s.created_at,
      };
    });

    // Filter by author
    if (author) {
      result = result.filter((r) => r.authorId === author);
    }

    return NextResponse.json({ stories: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查詢失敗" }, { status: 500 });
  }
}
