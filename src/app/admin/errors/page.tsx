"use client";

import { useState, useEffect, useCallback } from "react";

interface ErrorLog {
  id: string;
  player_id: string | null;
  session_id: string | null;
  error_type: string;
  error_detail: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  missing_round: "對話跳號",
  memory_lost: "記憶遺失",
  duplicate_message: "重複訊息",
  unpaired_message: "配對異常",
  summary_stale: "摘要過期",
  health_check_failed: "健康檢查失敗",
};

const ERROR_TYPE_COLORS: Record<string, string> = {
  missing_round: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  memory_lost: "text-red-400 bg-red-400/10 border-red-400/30",
  duplicate_message: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  unpaired_message: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  summary_stale: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  health_check_failed: "text-red-400 bg-red-400/10 border-red-400/30",
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [healthCheckResult, setHealthCheckResult] = useState<{
    checked: number;
    unhealthy: number;
    details: Array<{ sessionId: string; playerId: string; issues: string[] }>;
  } | null>(null);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", resolved: "false" });
      if (filter) params.set("type", filter);
      const res = await fetch(`/api/admin/errors?${params}`);
      const data = await res.json();
      setErrors(data.errors || []);
      setStats(data.stats || {});
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchErrors(); }, [fetchErrors]);

  async function resolveError(id: string) {
    await fetch("/api/admin/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", errorId: id }),
    });
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }

  async function resolveAll() {
    await fetch("/api/admin/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve_all" }),
    });
    fetchErrors();
  }

  async function runHealthCheck() {
    setHealthCheckLoading(true);
    try {
      const res = await fetch("/api/admin/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "health_check" }),
      });
      const data = await res.json();
      setHealthCheckResult(data);
      fetchErrors(); // Refresh errors after health check
    } catch {
      // ignore
    } finally {
      setHealthCheckLoading(false);
    }
  }

  const totalUnresolved = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-gold font-bold tracking-wider">錯誤監控</h2>
          <p className="text-xs text-ghost-white/40 mt-1">
            {totalUnresolved} 個未解決的問題
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={runHealthCheck}
            disabled={healthCheckLoading}
            className="btn-jade rounded-lg px-4 py-2 text-xs tracking-wider disabled:opacity-30"
          >
            {healthCheckLoading ? "檢查中..." : "執行健康檢查"}
          </button>
          {totalUnresolved > 0 && (
            <button
              onClick={resolveAll}
              className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider"
            >
              全部標為已解決
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(ERROR_TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => setFilter(filter === type ? "" : type)}
            className={`rounded-xl p-3 text-center transition-all border ${
              filter === type
                ? "border-gold/50 bg-gold/10"
                : "border-ghost-white/10 bg-ghost-white/5 hover:border-ghost-white/20"
            }`}
          >
            <div className="text-2xl font-bold text-gold">{stats[type] || 0}</div>
            <div className="text-[10px] text-ghost-white/50 mt-1">{label}</div>
          </button>
        ))}
      </div>

      {/* Health Check Result */}
      {healthCheckResult && (
        <div className="rounded-xl border border-ghost-white/10 p-4 bg-ghost-white/5">
          <h3 className="text-sm text-gold font-bold mb-2">健康檢查結果</h3>
          <p className="text-xs text-ghost-white/60">
            檢查了 {healthCheckResult.checked} 個活躍 session，
            {healthCheckResult.unhealthy} 個有問題
          </p>
          {healthCheckResult.details.length > 0 && (
            <div className="mt-3 space-y-2">
              {healthCheckResult.details.map((d, i) => (
                <div key={i} className="text-xs bg-red-400/5 border border-red-400/20 rounded-lg p-2">
                  <span className="text-ghost-white/40">Session: </span>
                  <span className="text-ghost-white/70 font-mono">{d.sessionId.slice(0, 8)}...</span>
                  <ul className="mt-1 ml-4 list-disc text-red-400/80">
                    {d.issues.map((issue, j) => <li key={j}>{issue}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error List */}
      {loading ? (
        <div className="text-center text-ghost-white/30 py-8 text-sm">載入中...</div>
      ) : errors.length === 0 ? (
        <div className="text-center text-ghost-white/30 py-12 text-sm">
          {filter ? "此類型沒有未解決的問題" : "目前沒有未解決的問題"}
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div
              key={err.id}
              className="rounded-xl border border-ghost-white/10 p-4 bg-ghost-white/5 flex items-start gap-4"
            >
              <span
                className={`shrink-0 text-[10px] px-2 py-1 rounded-md border ${
                  ERROR_TYPE_COLORS[err.error_type] || "text-ghost-white/50 bg-ghost-white/5 border-ghost-white/20"
                }`}
              >
                {ERROR_TYPE_LABELS[err.error_type] || err.error_type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-ghost-white/60">
                  <span className="text-ghost-white/30">Session: </span>
                  <span className="font-mono">{err.session_id?.slice(0, 8) || "-"}...</span>
                  <span className="text-ghost-white/30 ml-3">
                    {new Date(err.created_at).toLocaleString("zh-TW")}
                  </span>
                </div>
                <pre className="text-[11px] text-ghost-white/40 mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(err.error_detail, null, 0)}
                </pre>
              </div>
              <button
                onClick={() => resolveError(err.id)}
                className="shrink-0 text-[10px] text-ghost-white/30 hover:text-jade transition-colors"
              >
                解決
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
