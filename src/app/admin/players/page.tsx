"use client";

import { useState, useEffect, useCallback } from "react";

interface SessionInfo {
  id: string;
  slot_number: number;
  chosen_character: string | null;
  player_occupation: string | null;
  phase: string;
  round_number: number;
  current_location: string;
  updated_at: string;
}

interface PlayerInfo {
  player_id: string;
  player_name: string;
  last_active: string | null;
  created_at: string;
  sessions: SessionInfo[];
}

interface Stats {
  total_players: number;
  online_players: number;
  total_sessions: number;
  completed_sessions: number;
  avg_round_number: number;
}

const PHASE_LABELS: Record<string, string> = {
  setup: "建立中",
  character: "選擇角色",
  death: "現代篇",
  reincarnation: "轉生中",
  story: "古代篇",
  ending: "結局",
  export: "已完結",
};

export default function AdminPlayers() {
  const [secret, setSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/players?secret=${encodeURIComponent(key)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setPlayers(json.players || []);
      setStats(json.stats || null);
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

  function isOnline(lastActive: string | null): boolean {
    if (!lastActive) return false;
    return new Date().getTime() - new Date(lastActive).getTime() < 5 * 60 * 1000;
  }

  function getProgressPercent(round: number): number {
    return Math.min(Math.round((round / 100) * 100), 100);
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "剛剛";
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-gold font-bold tracking-wider">玩家監控面板</h2>
        <div className="flex gap-3">
          <a href="/admin/tokens" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">Token 監控</a>
          <button
            onClick={() => fetchData(secret)}
            disabled={loading}
            className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider disabled:opacity-40"
          >
            {loading ? "更新中⋯" : "重新整理"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="總註冊人數" value={stats.total_players} />
          <StatCard
            label="目前在線"
            value={stats.online_players}
            highlight
            suffix={
              <span className="inline-block w-2 h-2 rounded-full bg-jade ml-1.5 animate-pulse" />
            }
          />
          <StatCard label="總角色數" value={stats.total_sessions} />
          <StatCard label="已完結" value={stats.completed_sessions} />
          <StatCard label="平均進度" value={`${Math.round(stats.avg_round_number)}輪`} />
        </div>
      )}

      {/* Player List */}
      <div className="space-y-3">
        {players.map((p) => {
          const online = isOnline(p.last_active);
          const sessionList: SessionInfo[] = Array.isArray(p.sessions) ? p.sessions : [];

          return (
            <div key={p.player_id} className="glass-panel rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${online ? "bg-jade animate-pulse" : "bg-ghost-white/20"}`} />
                  <h3 className="text-ghost-white font-bold">{p.player_name}</h3>
                  <span className="text-[10px] text-ghost-white/30">
                    {sessionList.length} 個角色
                  </span>
                </div>
                <span className="text-[10px] text-ghost-white/30 shrink-0">
                  {online ? "在線" : `最後活動：${formatTime(p.last_active)}`}
                </span>
              </div>

              {sessionList.length > 0 ? (
                <div className="grid gap-2">
                  {sessionList.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 bg-ghost-white/3 rounded-lg px-3 py-2">
                      <span className="text-sm">
                        {s.chosen_character === "聶小倩" ? "幽" : "書"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gold/80">{s.chosen_character}</span>
                          <span className="text-[10px] text-ghost-white/30">({s.player_occupation})</span>
                          <span className="text-[10px] text-ghost-white/40 border border-ghost-white/10 rounded px-1 py-0.5">
                            {PHASE_LABELS[s.phase] || s.phase}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-ghost-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gold/40 rounded-full"
                              style={{ width: `${getProgressPercent(s.round_number)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-ghost-white/30 tabular-nums">
                            {s.round_number}輪 ({getProgressPercent(s.round_number)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ghost-white/20">尚未建立角色</p>
              )}
            </div>
          );
        })}

        {players.length === 0 && (
          <div className="text-center py-12 text-ghost-white/30">尚無玩家資料</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight, suffix }: {
  label: string;
  value: string | number;
  highlight?: boolean;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 space-y-1">
      <div className="text-ghost-white/40 text-xs tracking-wider">{label}</div>
      <div className={`text-xl font-bold tabular-nums flex items-center ${highlight ? "text-gold" : "text-ghost-white"}`}>
        {value}{suffix}
      </div>
    </div>
  );
}
