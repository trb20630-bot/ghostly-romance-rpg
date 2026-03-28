import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dailyHealthCheck } from "@/lib/context-guard";

export const runtime = "nodejs";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function checkAuth(request: NextRequest): boolean {
  const secret = request.nextUrl.searchParams.get("secret")
    || request.headers.get("x-admin-secret");
  return secret === ADMIN_SECRET;
}

/**
 * GET /api/admin/errors — 取得錯誤記錄
 * ?secret=...&limit=50&type=missing_round&resolved=false
 */
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const errorType = searchParams.get("type");
    const resolved = searchParams.get("resolved");

    let query = supabase
      .from("error_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (errorType) {
      query = query.eq("error_type", errorType);
    }
    if (resolved !== null && resolved !== undefined) {
      query = query.eq("resolved", resolved === "true");
    }

    const { data, error } = await query;
    if (error) throw error;

    // 統計各類錯誤數量
    const { data: stats } = await supabase
      .from("error_logs")
      .select("error_type")
      .eq("resolved", false);

    const typeCounts: Record<string, number> = {};
    for (const row of stats || []) {
      typeCounts[row.error_type] = (typeCounts[row.error_type] || 0) + 1;
    }

    return NextResponse.json({
      errors: data || [],
      stats: typeCounts,
      total: (data || []).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查詢失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/errors — 手動操作
 * action: "resolve" | "health_check"
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, secret } = body;

    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const supabase = getSupabase();

    if (action === "resolve") {
      const { errorId } = body;
      if (!errorId) {
        return NextResponse.json({ error: "缺少 errorId" }, { status: 400 });
      }
      await supabase
        .from("error_logs")
        .update({ resolved: true })
        .eq("id", errorId);
      return NextResponse.json({ ok: true });
    }

    if (action === "resolve_all") {
      await supabase
        .from("error_logs")
        .update({ resolved: true })
        .eq("resolved", false);
      return NextResponse.json({ ok: true });
    }

    if (action === "health_check") {
      const result = await dailyHealthCheck();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "無效操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失敗" },
      { status: 500 }
    );
  }
}
