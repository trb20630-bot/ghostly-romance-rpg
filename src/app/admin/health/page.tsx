"use client";

import { useState, useCallback } from "react";

interface SessionIssue {
  type: string;
  detail: string;
  severity: "error" | "warning";
}

interface SessionCheck {
  sessionId: string;
  playerId: string;
  playerName: string;
  character: string | null;
  roundNumber: number;
  phase: string;
  lastActive: string;
  isOnline: boolean;
  issues: SessionIssue[];
  healthy: boolean;
}

interface HealthSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  online: number;
}

const PHASE_LABELS: Record<string, string> = {
  death: "現代篇",
  reincarnation: "輪迴",
  story: "主線",
  ending: "結局",
  export: "匯出",
};

const ISSUE_LABELS: Record<string, string> = {
  missing_round: "對話跳號",
  unpaired: "配對異常",
  duplicate: "重複紀錄",
  memory_lost: "記憶遺失",
  memory_empty_facts: "事實為空",
  summary_stale: "摘要過期",
};

export default function HealthPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [results, setResults] = useState<SessionCheck[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unhealthy">("all");
  const [repairing, setRepairing] = useState<Set<string>>(new Set());
  const [repairResults, setRepairResults] = useState<Map<string, string[]>>(new Map());

  const runCheck = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    setRepairResults(new Map());
    try {
      const res = await fetch(`/api/admin/health?secret=${encodeURIComponent(key)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "檢查失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleRepair(sessionId: string) {
    setRepairing((prev) => new Set(prev).add(sessionId));
    try {
      const res = await fetch("/api/admin/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, action: "repair", sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "修復失敗");
      }
      setRepairResults((prev) => new Map(prev).set(sessionId, data.repairs || []));
      // 重新檢查以更新狀態
      await runCheck(secret);
    } catch (err) {
      setRepairResults((prev) =>
        new Map(prev).set(sessionId, [`修復失敗：${err instanceof Error ? err.message : "未知錯誤"}`])
      );
    } finally {
      setRepairing((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (secret.trim()) runCheck(secret.trim());
  }

  // 密碼輸入畫面
  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <form onSubmit={handleLogin} className="glass-panel rounded-2xl p-8 w-full max-w-sm space-y-4">
          <h2 className="text-gold text-lg font-bold text-center tracking-wider">系統健康檢查</h2>
          <p className="text-xs text-ghost-white/40 text-center">請輸入管理員密碼</p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="輸入密碼⋯"
            className="w-full input-ancient rounded-lg px-4 py-3 text-sm"
            autoFocus
          />
          {error && <p className="text-blood-red text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-jade rounded-lg py-3 text-sm font-bold tracking-wider disabled:opacity-40"
          >
            {loading ? "檢查中⋯" : "進入"}
          </button>
        </form>
      </div>
    );
  }

  const displayed = filter === "unhealthy" ? results.filter((r) => !r.healthy) : results;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-gold font-bold tracking-wider">系統健康檢查</h2>
          <p className="text-xs text-ghost-white/40 mt-1">
            只讀檢查，不影響玩家遊玩
          </p>
        </div>
        <button
          onClick={() => runCheck(secret)}
          disabled={loading}
          className="btn-jade rounded-lg px-5 py-2.5 text-sm font-bold tracking-wider disabled:opacity-30"
        >
          {loading ? "檢查中⋯" : "立即檢查"}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="總 Session" value={summary.total} />
          <SummaryCard label="健康" value={summary.healthy} color="text-jade" />
          <SummaryCard label="有問題" value={summary.unhealthy} color={summary.unhealthy > 0 ? "text-blood-red" : "text-jade"} />
          <SummaryCard label="在線中" value={summary.online} color="text-gold" />
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            filter === "all"
              ? "bg-gold/20 text-gold border border-gold/30"
              : "text-ghost-white/40 hover:text-ghost-white/60 border border-transparent"
          }`}
        >
          全部 ({results.length})
        </button>
        <button
          onClick={() => setFilter("unhealthy")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            filter === "unhealthy"
              ? "bg-blood-red/20 text-blood-red border border-blood-red/30"
              : "text-ghost-white/40 hover:text-ghost-white/60 border border-transparent"
          }`}
        >
          有問題 ({results.filter((r) => !r.healthy).length})
        </button>
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="text-center text-ghost-white/30 py-12 text-sm">檢查中...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center text-ghost-white/30 py-12 text-sm">
          {filter === "unhealthy" ? "所有 session 都健康" : "尚無資料，請點「立即檢查」"}
        </div>
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ghost-white/50 text-xs border-b border-gold/10">
                  <th className="text-left py-3 px-4">玩家</th>
                  <th className="text-center py-3 px-3">狀態</th>
                  <th className="text-left py-3 px-3">問題</th>
                  <th className="text-center py-3 px-3">在線</th>
                  <th className="text-center py-3 px-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r) => (
                  <tr key={r.sessionId} className="border-b border-gold/5 hover:bg-gold/5 transition-colors">
                    {/* 玩家 */}
                    <td className="py-3 px-4">
                      <div className="text-ghost-white/90 font-medium">{r.playerName}</div>
                      <div className="text-[10px] text-ghost-white/40 mt-0.5">
                        {r.character || "—"} · {PHASE_LABELS[r.phase] || r.phase} · 第{r.roundNumber}輪
                      </div>
                      <div className="text-[10px] text-ghost-white/25 font-mono mt-0.5">
                        {r.sessionId.slice(0, 8)}...
                      </div>
                    </td>

                    {/* 狀態 */}
                    <td className="py-3 px-3 text-center">
                      {r.healthy ? (
                        <span className="text-jade text-lg" title="健康">&#10003;</span>
                      ) : (
                        <span className="text-blood-red text-lg" title="有問題">&#10007;</span>
                      )}
                    </td>

                    {/* 問題 */}
                    <td className="py-3 px-3">
                      {r.issues.length === 0 ? (
                        <span className="text-ghost-white/30 text-xs">無</span>
                      ) : (
                        <div className="space-y-1">
                          {r.issues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span
                                className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border ${
                                  issue.severity === "error"
                                    ? "text-red-400 bg-red-400/10 border-red-400/30"
                                    : "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
                                }`}
                              >
                                {ISSUE_LABELS[issue.type] || issue.type}
                              </span>
                              <span className="text-[11px] text-ghost-white/50 leading-tight">{issue.detail}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 修復結果 */}
                      {repairResults.has(r.sessionId) && (
                        <div className="mt-2 text-[11px] text-jade/80 border-t border-jade/10 pt-1.5">
                          {repairResults.get(r.sessionId)!.map((msg, i) => (
                            <div key={i}>{msg}</div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* 在線 */}
                    <td className="py-3 px-3 text-center">
                      {r.isOnline ? (
                        <span className="text-jade" title="在線（5分鐘內有活動）">&#9679;</span>
                      ) : (
                        <span className="text-ghost-white/20" title="離線">&#9675;</span>
                      )}
                    </td>

                    {/* 操作 */}
                    <td className="py-3 px-4 text-center">
                      {r.healthy ? (
                        <span className="text-ghost-white/20 text-xs">—</span>
                      ) : r.isOnline ? (
                        <span className="text-[10px] text-ghost-white/30 leading-tight block max-w-[100px]">
                          玩家遊玩中，請稍後修復
                        </span>
                      ) : repairing.has(r.sessionId) ? (
                        <span className="text-gold text-xs">修復中⋯</span>
                      ) : (
                        <button
                          onClick={() => handleRepair(r.sessionId)}
                          className="btn-jade rounded-lg px-3 py-1.5 text-[11px] tracking-wider"
                        >
                          一鍵修復
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Safety Note */}
      <div className="text-[10px] text-ghost-white/20 text-center space-y-1">
        <p>&#9679; 在線 = 5 分鐘內有活動 &#9675; 離線 = 超過 5 分鐘無活動</p>
        <p>修復前會自動備份原始資料到 error_logs 表</p>
        <p>在線玩家不可修復，避免干擾遊玩</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color || "text-ghost-white"}`}>{value}</div>
      <div className="text-[10px] text-ghost-white/40 mt-1 tracking-wider">{label}</div>
    </div>
  );
}
