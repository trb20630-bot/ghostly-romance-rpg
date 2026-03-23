"use client";

import { useState, useEffect, useCallback } from "react";

interface MusicLog {
  id: string;
  session_id: string;
  player_name: string;
  from_scene: string | null;
  to_scene: string;
  from_music: string | null;
  to_music: string | null;
  ai_response_snippet: string | null;
  is_abnormal: boolean;
  created_at: string;
}

interface MusicFeedback {
  id: string;
  player_name: string;
  current_scene: string | null;
  current_music: string | null;
  recent_dialogue: string | null;
  player_feedback: string;
  is_resolved: boolean;
  created_at: string;
}

const SCENE_LABELS: Record<string, string> = {
  MODERN: "現代",
  DEATH: "死亡",
  REBIRTH: "輪迴",
  LANRUO: "蘭若寺",
  ROMANCE: "浪漫",
  BATTLE: "戰鬥",
  ENDING: "結局",
};

function sceneBadge(scene: string | null) {
  if (!scene) return <span className="text-ghost-white/20">—</span>;
  const colors: Record<string, string> = {
    MODERN: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    DEATH: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    REBIRTH: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    LANRUO: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    ROMANCE: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    BATTLE: "bg-red-500/20 text-red-300 border-red-500/30",
    ENDING: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[scene] || "bg-ghost-white/10 text-ghost-white/50 border-ghost-white/20"}`}>
      {SCENE_LABELS[scene] || scene}
    </span>
  );
}

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時前`;
  return `${Math.floor(hours / 24)}天前`;
}

export default function MusicPage() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [logs, setLogs] = useState<MusicLog[]>([]);
  const [feedback, setFeedback] = useState<MusicFeedback[]>([]);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, abnormal: 0, normal: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [tab, setTab] = useState<"logs" | "feedback">("logs");

  const fetchData = useCallback(async (key: string, filterAbnormal: boolean) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ secret: key });
      if (filterAbnormal) params.set("abnormal_only", "true");
      const res = await fetch(`/api/admin/music?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLogs(data.logs || []);
      setFeedback(data.feedback || []);
      setFeedbackCount(data.feedbackCount || 0);
      setStats(data.stats || { total: 0, abnormal: 0, normal: 0 });
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
    const interval = setInterval(() => fetchData(secret, abnormalOnly), 30000);
    return () => clearInterval(interval);
  }, [authenticated, secret, abnormalOnly, fetchData]);

  // Re-fetch when filter changes
  useEffect(() => {
    if (authenticated) fetchData(secret, abnormalOnly);
  }, [abnormalOnly, authenticated, secret, fetchData]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (secret.trim()) fetchData(secret.trim(), abnormalOnly);
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <form onSubmit={handleLogin} className="glass-panel rounded-2xl p-8 w-full max-w-sm space-y-4">
          <h2 className="text-gold text-lg font-bold text-center tracking-wider">音樂監控</h2>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-gold font-bold tracking-wider">音樂切換監控</h2>
          <p className="text-xs text-ghost-white/40 mt-1">最近 100 次切換紀錄</p>
        </div>
        <button
          onClick={() => fetchData(secret, abnormalOnly)}
          disabled={loading}
          className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider disabled:opacity-40"
        >
          {loading ? "更新中⋯" : "重新整理"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-ghost-white">{stats.total}</div>
          <div className="text-[10px] text-ghost-white/40 mt-1">總切換</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-jade">{stats.normal}</div>
          <div className="text-[10px] text-ghost-white/40 mt-1">正常</div>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold tabular-nums ${stats.abnormal > 0 ? "text-blood-red" : "text-ghost-white"}`}>{stats.abnormal}</div>
          <div className="text-[10px] text-ghost-white/40 mt-1">異常</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("logs")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            tab === "logs"
              ? "bg-gold/20 text-gold border border-gold/30"
              : "text-ghost-white/40 hover:text-ghost-white/60 border border-transparent"
          }`}
        >
          切換紀錄
        </button>
        <button
          onClick={() => setTab("feedback")}
          className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
            tab === "feedback"
              ? "bg-gold/20 text-gold border border-gold/30"
              : "text-ghost-white/40 hover:text-ghost-white/60 border border-transparent"
          }`}
        >
          玩家回報 {feedbackCount > 0 && <span className="ml-1 text-blood-red">({feedbackCount})</span>}
        </button>
        {tab === "logs" && (
          <>
            <span className="text-ghost-white/10">|</span>
            <button
              onClick={() => setAbnormalOnly(false)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                !abnormalOnly
                  ? "bg-ghost-white/10 text-ghost-white/70 border border-ghost-white/20"
                  : "text-ghost-white/30 hover:text-ghost-white/50 border border-transparent"
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setAbnormalOnly(true)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                abnormalOnly
                  ? "bg-blood-red/20 text-blood-red border border-blood-red/30"
                  : "text-ghost-white/30 hover:text-ghost-white/50 border border-transparent"
              }`}
            >
              異常
            </button>
          </>
        )}
      </div>

      {/* Table — Logs */}
      {tab === "logs" && <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ghost-white/50 text-xs border-b border-gold/10">
                <th className="text-left py-3 px-4">時間</th>
                <th className="text-left py-3 px-3">玩家</th>
                <th className="text-center py-3 px-3">場景變化</th>
                <th className="text-left py-3 px-3">音樂變化</th>
                <th className="text-left py-3 px-4">AI 回覆片段</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className={`border-b border-gold/5 transition-colors ${
                    log.is_abnormal
                      ? "bg-blood-red/5 hover:bg-blood-red/10"
                      : "hover:bg-gold/5"
                  }`}
                >
                  {/* 時間 */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="text-ghost-white/60 text-xs">{timeAgo(log.created_at)}</div>
                    <div className="text-[9px] text-ghost-white/25 mt-0.5">
                      {new Date(log.created_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </td>

                  {/* 玩家 */}
                  <td className="py-3 px-3">
                    <span className="text-ghost-white/80 text-xs">{log.player_name}</span>
                  </td>

                  {/* 場景變化 */}
                  <td className="py-3 px-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {sceneBadge(log.from_scene)}
                      <span className="text-ghost-white/20 text-[10px]">→</span>
                      {sceneBadge(log.to_scene)}
                      {log.is_abnormal && (
                        <span className="text-blood-red text-[10px] ml-1" title="異常切換">!!</span>
                      )}
                    </div>
                  </td>

                  {/* 音樂變化 */}
                  <td className="py-3 px-3">
                    <div className="text-[10px] text-ghost-white/40 max-w-[160px] truncate" title={`${log.from_music || "—"} → ${log.to_music || "—"}`}>
                      {simplifyMusic(log.from_music)} → {simplifyMusic(log.to_music)}
                    </div>
                  </td>

                  {/* AI 回覆片段 */}
                  <td className="py-3 px-4">
                    <div className="text-[11px] text-ghost-white/40 max-w-[250px] truncate" title={log.ai_response_snippet || ""}>
                      {log.ai_response_snippet || "—"}
                    </div>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-ghost-white/20 text-sm">
                    {abnormalOnly ? "沒有異常切換紀錄" : "尚無音樂切換紀錄"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Feedback Tab */}
      {tab === "feedback" && (
        <div className="space-y-3">
          {feedback.length === 0 ? (
            <div className="text-center text-ghost-white/20 py-12 text-sm">尚無玩家回報</div>
          ) : (
            feedback.map((fb) => (
              <div
                key={fb.id}
                className={`glass-panel rounded-xl p-4 space-y-2 ${fb.is_resolved ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ghost-white/80">{fb.player_name}</span>
                    {fb.current_scene && sceneBadge(fb.current_scene)}
                    {!fb.is_resolved && <span className="text-[9px] text-blood-red border border-blood-red/30 rounded px-1">待處理</span>}
                    {fb.is_resolved && <span className="text-[9px] text-jade border border-jade/30 rounded px-1">已解決</span>}
                  </div>
                  <span className="text-[10px] text-ghost-white/25">{timeAgo(fb.created_at)}</span>
                </div>

                <p className="text-sm text-ghost-white/70 leading-relaxed">{fb.player_feedback}</p>

                {fb.current_music && (
                  <p className="text-[10px] text-ghost-white/30">
                    播放中：{simplifyMusic(fb.current_music)}
                  </p>
                )}

                {fb.recent_dialogue && (
                  <details className="text-[10px]">
                    <summary className="text-ghost-white/30 cursor-pointer hover:text-ghost-white/50">查看最近對話</summary>
                    <pre className="text-ghost-white/25 mt-1 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{fb.recent_dialogue}</pre>
                  </details>
                )}

                {!fb.is_resolved && (
                  <button
                    onClick={async () => {
                      await fetch("/api/admin/music", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ secret, action: "resolve_feedback", feedbackId: fb.id }),
                      });
                      fetchData(secret, abnormalOnly);
                    }}
                    className="text-[10px] text-ghost-white/30 hover:text-jade transition-colors"
                  >
                    標為已解決
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function simplifyMusic(filename: string | null): string {
  if (!filename) return "—";
  return filename.replace(/\.mp3$/, "").replace(/^.*\//, "");
}
