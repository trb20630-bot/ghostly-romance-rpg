"use client";

import { useState } from "react";
import GameIcon from "./GameIcon";

interface SessionInfo {
  id: string;
  slot_number: number;
  character_name: string | null;
  chosen_character: string | null;
  player_occupation: string | null;
  player_age: number | null;
  phase: string;
  round_number: number;
  updated_at: string;
}

interface Props {
  playerId: string;
  playerName: string;
  sessions: SessionInfo[];
  onSelectSession: (sessionId: string) => void;
  onNewGame: (slotNumber: number) => void;
  onLogout: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  setup: "建立中",
  character: "選擇角色",
  death: "現代篇",
  reincarnation: "輪迴中",
  story: "古代篇",
  ending: "結局",
  export: "已完結",
};

const MAX_SLOTS = 3;

export default function SlotSelect({
  playerId,
  playerName,
  sessions,
  onSelectSession,
  onNewGame,
  onLogout,
}: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleDelete(sessionId: string) {
    setDeleting(sessionId);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_session",
          playerId,
          sessionId,
        }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      // Silent fail
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  function getProgressPercent(round: number): number {
    const estimated = 100;
    return Math.min(Math.round((round / estimated) * 100), 100);
  }

  function getNextSlotNumber(): number {
    const usedSlots = sessions.map((s) => s.slot_number);
    for (let i = 1; i <= MAX_SLOTS; i++) {
      if (!usedSlots.includes(i)) return i;
    }
    return MAX_SLOTS + 1;
  }

  function formatTime(dateStr: string): string {
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

  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-lg animate-fade-in-up px-4 pt-[5vh] sm:pt-[8vh] pb-8">
        {/* Title */}
        <div className="text-center mb-6">
          <div className="inline-block mb-3">
            <span className="animate-ghost-float inline-block"><GameIcon name="lantern" size={72} /></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">
            選 擇 角 色
          </h1>
          <p className="text-ghost-white/60 text-sm tracking-wide">
            歡迎回來，{playerName}
          </p>
        </div>

        {/* Session Cards */}
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="relative group">
              <button
                onClick={() => onSelectSession(session.id)}
                className="w-full text-left glass-panel ancient-frame rounded-xl p-5 border border-gold/10 hover:border-gold/30 transition-all hover:scale-[1.01]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Character name */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">
                        {session.chosen_character === "聶小倩" ? "幽" : "書"}
                      </span>
                      <h3 className="text-gold font-bold tracking-wider">
                        {session.character_name || session.chosen_character || "未選擇"}
                      </h3>
                      <span className="text-[10px] text-ghost-white/40 border border-ghost-white/10 rounded px-1.5 py-0.5">
                        存檔 {session.slot_number}
                      </span>
                    </div>

                    {/* Info */}
                    <p className="text-xs text-ghost-white/50 mb-2">
                      {session.player_age}歲{session.player_occupation} · {PHASE_LABELS[session.phase] || session.phase} · 第 {session.round_number} 輪
                    </p>

                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-ghost-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-jade/60 to-gold/60 rounded-full transition-all"
                          style={{ width: `${getProgressPercent(session.round_number)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-ghost-white/40 tabular-nums w-8 text-right">
                        {getProgressPercent(session.round_number)}%
                      </span>
                    </div>

                    {/* Last played */}
                    <p className="text-[10px] text-ghost-white/30 mt-2">
                      最後遊玩：{formatTime(session.updated_at)}
                    </p>
                  </div>
                </div>
              </button>

              {/* Delete button — always visible */}
              {confirmDelete === session.id ? (
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-10 bg-night/90 rounded-lg p-2.5 border border-blood-red/20">
                  <p className="text-[10px] text-ghost-white/70 max-w-[180px] leading-relaxed">
                    確定要刪除這個角色嗎？所有進度將永久刪除，此操作無法復原
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                      disabled={deleting === session.id}
                      className="text-[10px] bg-blood-red/20 text-blood-red border border-blood-red/30 rounded px-2.5 py-1 hover:bg-blood-red/30 disabled:opacity-40"
                    >
                      {deleting === session.id ? "刪除中⋯" : "確定刪除"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                      className="text-[10px] text-ghost-white/50 border border-ghost-white/10 rounded px-2.5 py-1 hover:bg-ghost-white/5"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(session.id);
                  }}
                  className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-ghost-white/30 hover:text-blood-red/70 hover:bg-blood-red/10 transition-all text-xs z-10"
                  title="刪除此角色"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* New game button */}
          {sessions.length < MAX_SLOTS && (
            <button
              onClick={() => onNewGame(getNextSlotNumber())}
              className="w-full glass-panel rounded-xl p-5 border border-dashed border-gold/20 hover:border-gold/40 transition-all hover:scale-[1.01] text-center"
            >
              <div className="text-2xl text-gold/40 mb-2">+</div>
              <p className="text-sm text-gold/60 tracking-wider">建立新角色</p>
              <p className="text-[10px] text-ghost-white/30 mt-1">
                {sessions.length}/{MAX_SLOTS} 個存檔已使用
              </p>
            </button>
          )}
        </div>

        {/* Logout */}
        <div className="text-center mt-6">
          <button
            onClick={onLogout}
            className="text-xs text-ghost-white/30 hover:text-ghost-white/60 transition-colors tracking-wider"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  );
}
