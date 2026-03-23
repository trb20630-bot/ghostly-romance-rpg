import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/** GET /api/gallery/story?id=xxx — 取得完整故事章節 */
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("story_exports")
      .select("chapters, is_public")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "找不到" }, { status: 404 });
    }

    if (!data.is_public) {
      return NextResponse.json({ error: "此作品未公開" }, { status: 403 });
    }

    // Increment views
    void supabase.from("story_exports").select("views_count").eq("id", id).single().then(({ data: d }) => {
      if (d) supabase.from("story_exports").update({ views_count: ((d as Record<string, number>).views_count || 0) + 1 }).eq("id", id);
    });

    return NextResponse.json({ chapters: data.chapters || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "失敗" }, { status: 500 });
  }
}
