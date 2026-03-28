import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateOrFallback, unauthorizedResponse } from "@/lib/auth-guard";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Banned word patterns
const BAD_PATTERNS = [
  /[操幹靠屌]你[媽嗎馬的]/,
  /他[媽嗎]的/,
  /去死/,
  /白癡|智障|廢物|垃圾|賤人|婊子|狗屎|混蛋|王八/,
  /fuck|shit|bitch|asshole|damn/i,
];

function isOffensive(text: string): string | null {
  for (const p of BAD_PATTERNS) {
    if (p.test(text)) return "請使用文明用語";
  }
  if (/你(是|這個?)(白癡|智障|廢物|垃圾|腦殘)/.test(text)) return "請友善留言";
  return null;
}

/** GET /api/comments?storyId=xxx（公開，不需認證） */
export async function GET(request: NextRequest) {
  try {
    const storyId = request.nextUrl.searchParams.get("storyId");
    if (!storyId) return NextResponse.json({ error: "缺少 storyId" }, { status: 400 });

    const supabase = db();
    const { data, error } = await supabase
      .from("comments")
      .select("id, user_id, user_name, content, is_deleted, created_at")
      .eq("story_id", storyId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ comments: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "失敗" }, { status: 500 });
  }
}

/** POST /api/comments — 新增留言（需認證） */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storyId, userName, content } = body;

    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) return unauthorizedResponse();

    if (!storyId || !content?.trim()) {
      return NextResponse.json({ error: "缺少參數" }, { status: 400 });
    }

    const blocked = isOffensive(content);
    if (blocked) {
      return NextResponse.json({ error: blocked }, { status: 400 });
    }

    const supabase = db();

    const { error } = await supabase.from("comments").insert({
      story_id: storyId,
      user_id: playerId,
      user_name: userName || "路人",
      content: content.trim().slice(0, 500),
    });

    if (error) throw error;

    // Update comment count
    const { data: storyData } = await supabase.from("story_exports").select("comments_count").eq("id", storyId).single();
    if (storyData) {
      await supabase.from("story_exports").update({ comments_count: ((storyData.comments_count as number) || 0) + 1 }).eq("id", storyId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "失敗" }, { status: 500 });
  }
}

/** DELETE /api/comments — 刪除留言（需認證 + 只能刪自己的） */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { commentId } = body;

    const playerId = await authenticateOrFallback(request, body.playerId);
    if (!playerId) return unauthorizedResponse();

    if (!commentId) return NextResponse.json({ error: "缺少參數" }, { status: 400 });

    const supabase = db();

    // 只能刪除自己的留言
    const { error } = await supabase
      .from("comments")
      .update({ is_deleted: true })
      .eq("id", commentId)
      .eq("user_id", playerId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "失敗" }, { status: 500 });
  }
}
