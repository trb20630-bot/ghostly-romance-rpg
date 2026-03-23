import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * GET /api/admin/tokens — Token 監控數據 API
 * 需要 Authorization: Bearer <ADMIN_SECRET>
 */
export async function GET(request: NextRequest) {
  // 驗證管理員身份
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
  }

  // 支援 query param 作為備用驗證方式：/api/admin/tokens?secret=xxx
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");
  const queryToken = request.nextUrl.searchParams.get("secret");
  const token = bearerToken || queryToken;

  if (token !== adminSecret) {
    return NextResponse.json({
      error: "未授權",
      debug: {
        hasEnvVar: !!adminSecret,
        envVarLength: adminSecret.length,
        receivedTokenLength: token?.length ?? 0,
      },
    }, { status: 401 });
  }

  // Service role client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 並行查詢所有數據
    const [todayStats, weekStats, playerUsage, dailyTrend] = await Promise.all([
      supabase.rpc("get_token_stats", { period: "today" }),
      supabase.rpc("get_token_stats", { period: "week" }),
      supabase.rpc("get_player_token_usage"),
      supabase.rpc("get_daily_token_trend"),
    ]);

    return NextResponse.json({
      today: todayStats.data?.[0] ?? null,
      weekly: weekStats.data?.[0] ?? null,
      perPlayer: playerUsage.data ?? [],
      dailyTrend: dailyTrend.data ?? [],
    });
  } catch (error) {
    console.error("Admin tokens API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查詢失敗" },
      { status: 500 }
    );
  }
}
