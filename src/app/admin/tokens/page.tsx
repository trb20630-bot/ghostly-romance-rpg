"use client";

import { useState, useEffect, useCallback } from "react";

interface TokenStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  sonnet_requests: number;
  haiku_requests: number;
  sonnet_tokens: number;
  haiku_tokens: number;
}

interface PlayerUsage {
  player_id: string;
  display_name: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
}

interface DailyTrend {
  day: string;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  avg_tokens_per_request: number;
}

interface DashboardData {
  today: TokenStats | null;
  weekly: TokenStats | null;
  perPlayer: PlayerUsage[];
  dailyTrend: DailyTrend[];
}

export default function TokenDashboard() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tokens?secret=${encodeURIComponent(key)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => fetchData(secret), 30000);
    return () => clearInterval(interval);
  }, [authenticated, secret, fetchData]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (secret.trim()) fetchData(secret.trim());
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <form onSubmit={handleLogin} className="glass-panel rounded-2xl p-8 w-full max-w-sm space-y-4">
          <h2 className="text-gold text-lg font-bold text-center tracking-wider">管理員驗證</h2>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="輸入 Admin Secret⋯"
            className="w-full input-ancient rounded-lg px-4 py-3 text-sm"
            autoFocus
          />
          {error && <p className="text-blood-red text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-jade rounded-lg py-3 text-sm font-bold tracking-wider disabled:opacity-40"
          >
            {loading ? "驗證中⋯" : "進入"}
          </button>
        </form>
      </div>
    );
  }

  const today = data?.today;
  const weekly = data?.weekly;

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-gold font-bold tracking-wider">Token 監控面板</h2>
        <div className="flex gap-3 items-center">
          <a href="/admin/players" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">玩家監控</a>
          <button
            onClick={() => fetchData(secret)}
            disabled={loading}
            className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider disabled:opacity-40"
          >
            {loading ? "更新中⋯" : "重新整理"}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="今日請求" value={today?.total_requests ?? 0} />
        <StatCard label="今日 Tokens" value={formatNumber(
          (today?.total_input_tokens ?? 0) + (today?.total_output_tokens ?? 0)
        )} />
        <StatCard label="今日費用" value={`$${(today?.total_cost ?? 0).toFixed(4)}`} highlight />
        <StatCard label="本週費用" value={`$${(weekly?.total_cost ?? 0).toFixed(4)}`} highlight />
      </div>

      {/* Model Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Model Split */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <h3 className="text-gold/80 text-sm font-bold tracking-wider">今日模型使用比例</h3>
          <ModelBar
            sonnetReqs={today?.sonnet_requests ?? 0}
            haikuReqs={today?.haiku_requests ?? 0}
            sonnetTokens={today?.sonnet_tokens ?? 0}
            haikuTokens={today?.haiku_tokens ?? 0}
          />
        </div>

        {/* Weekly Model Split */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <h3 className="text-gold/80 text-sm font-bold tracking-wider">本週模型使用比例</h3>
          <ModelBar
            sonnetReqs={weekly?.sonnet_requests ?? 0}
            haikuReqs={weekly?.haiku_requests ?? 0}
            sonnetTokens={weekly?.sonnet_tokens ?? 0}
            haikuTokens={weekly?.haiku_tokens ?? 0}
          />
        </div>
      </div>

      {/* Daily Trend */}
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="text-gold/80 text-sm font-bold tracking-wider">每日趨勢（最近 14 天）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ghost-white/50 text-xs border-b border-gold/10">
                <th className="text-left py-2 pr-4">日期</th>
                <th className="text-right py-2 px-4">請求數</th>
                <th className="text-right py-2 px-4">總 Tokens</th>
                <th className="text-right py-2 px-4">平均/請求</th>
                <th className="text-right py-2 pl-4">費用</th>
              </tr>
            </thead>
            <tbody>
              {(data?.dailyTrend ?? []).map((d) => (
                <tr key={d.day} className="border-b border-gold/5 hover:bg-gold/5 transition-colors">
                  <td className="py-2.5 pr-4 text-ghost-white/70">{d.day}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{d.total_requests}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{formatNumber(d.total_tokens)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-ghost-white/50">
                    {formatNumber(d.avg_tokens_per_request)}
                  </td>
                  <td className="py-2.5 pl-4 text-right tabular-nums text-gold">
                    ${Number(d.total_cost).toFixed(4)}
                  </td>
                </tr>
              ))}
              {(data?.dailyTrend ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-ghost-white/30">尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per Player */}
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h3 className="text-gold/80 text-sm font-bold tracking-wider">玩家消耗排行</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ghost-white/50 text-xs border-b border-gold/10">
                <th className="text-left py-2 pr-4">玩家</th>
                <th className="text-right py-2 px-4">請求數</th>
                <th className="text-right py-2 px-4">輸入 Tokens</th>
                <th className="text-right py-2 px-4">輸出 Tokens</th>
                <th className="text-right py-2 pl-4">費用</th>
              </tr>
            </thead>
            <tbody>
              {(data?.perPlayer ?? []).map((p) => (
                <tr key={p.player_id} className="border-b border-gold/5 hover:bg-gold/5 transition-colors">
                  <td className="py-2.5 pr-4">{p.display_name}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{p.total_requests}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{formatNumber(p.total_input_tokens)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">{formatNumber(p.total_output_tokens)}</td>
                  <td className="py-2.5 pl-4 text-right tabular-nums text-gold">
                    ${Number(p.total_cost).toFixed(4)}
                  </td>
                </tr>
              ))}
              {(data?.perPlayer ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-ghost-white/30">尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Summary */}
      <div className="glass-panel rounded-xl p-6 space-y-3">
        <h3 className="text-gold/80 text-sm font-bold tracking-wider">本週摘要</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-ghost-white/40 text-xs mb-1">總請求</div>
            <div className="text-lg tabular-nums">{weekly?.total_requests ?? 0}</div>
          </div>
          <div>
            <div className="text-ghost-white/40 text-xs mb-1">輸入 Tokens</div>
            <div className="text-lg tabular-nums">{formatNumber(weekly?.total_input_tokens ?? 0)}</div>
          </div>
          <div>
            <div className="text-ghost-white/40 text-xs mb-1">輸出 Tokens</div>
            <div className="text-lg tabular-nums">{formatNumber(weekly?.total_output_tokens ?? 0)}</div>
          </div>
          <div>
            <div className="text-ghost-white/40 text-xs mb-1">Haiku 分流率</div>
            <div className="text-lg tabular-nums">
              {weekly && (weekly.sonnet_requests + weekly.haiku_requests) > 0
                ? `${Math.round((weekly.haiku_requests / (weekly.sonnet_requests + weekly.haiku_requests)) * 100)}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Sub-components ===== */

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="glass-panel rounded-xl p-4 space-y-1">
      <div className="text-ghost-white/40 text-xs tracking-wider">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${highlight ? "text-gold" : "text-ghost-white"}`}>
        {value}
      </div>
    </div>
  );
}

function ModelBar({
  sonnetReqs, haikuReqs, sonnetTokens, haikuTokens,
}: {
  sonnetReqs: number; haikuReqs: number; sonnetTokens: number; haikuTokens: number;
}) {
  const totalReqs = sonnetReqs + haikuReqs;
  const sonnetPct = totalReqs > 0 ? (sonnetReqs / totalReqs) * 100 : 0;
  const haikuPct = totalReqs > 0 ? (haikuReqs / totalReqs) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* Bar */}
      <div className="flex h-6 rounded-lg overflow-hidden border border-gold/10">
        {sonnetPct > 0 && (
          <div
            className="bg-lantern/40 flex items-center justify-center text-[10px] text-ghost-white/80 transition-all"
            style={{ width: `${sonnetPct}%` }}
          >
            {sonnetPct >= 15 ? `Sonnet ${Math.round(sonnetPct)}%` : ""}
          </div>
        )}
        {haikuPct > 0 && (
          <div
            className="bg-jade/40 flex items-center justify-center text-[10px] text-ghost-white/80 transition-all"
            style={{ width: `${haikuPct}%` }}
          >
            {haikuPct >= 15 ? `Haiku ${Math.round(haikuPct)}%` : ""}
          </div>
        )}
        {totalReqs === 0 && (
          <div className="w-full flex items-center justify-center text-[10px] text-ghost-white/30">
            尚無資料
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex justify-between text-xs text-ghost-white/50">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-lantern/40" />
          Sonnet: {sonnetReqs} 次 / {formatNumber(sonnetTokens)} tokens
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-jade/40" />
          Haiku: {haikuReqs} 次 / {formatNumber(haikuTokens)} tokens
        </div>
      </div>
    </div>
  );
}

function formatNumber(n: number | string): string {
  const num = typeof n === "string" ? Number(n) : n;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
