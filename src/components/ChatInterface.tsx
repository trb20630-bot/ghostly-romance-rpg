"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useGame } from "./GameProvider";
import { getRecentHistory } from "@/lib/game-store";
import type { ChatMessage } from "@/types/game";

const PHASE_LABELS: Record<string, string> = {
  death: "現代篇",
  reincarnation: "輪迴",
  story: "主線故事",
  ending: "結局",
};

export default function ChatInterface() {
  const { state, dispatch } = useGame();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const autoStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { game, messages, memory } = state;

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Send message
  const sendMessage = useCallback(
    async (text: string) => {
      if (loading) return;
      setLoading(true);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", payload: userMsg });

      try {
        const recentHistory = getRecentHistory([...messages, userMsg], 15);
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            gameState: game,
            memory,
            recentHistory,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "API 錯誤");
        }

        const data = await res.json();
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message,
          timestamp: Date.now(),
          model: data.model,
        };
        dispatch({ type: "ADD_MESSAGE", payload: assistantMsg });
        dispatch({ type: "INCREMENT_ROUND" });

        if ((game.roundNumber + 1) % 10 === 0 && game.roundNumber > 0) {
          triggerSummarize();
        }
      } catch (err) {
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: crypto.randomUUID(),
            role: "system",
            content: `錯誤：${err instanceof Error ? err.message : "未知錯誤"}`,
            timestamp: Date.now(),
          },
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, game, memory, dispatch]
  );

  // Auto-start death phase
  useEffect(() => {
    if (game.phase === "death" && messages.length === 0 && !autoStartedRef.current && game.player) {
      autoStartedRef.current = true;
      sendMessage(
        `我是一個${game.player.age}歲的${game.player.occupation}，${
          game.player.gender === "female" ? "女性" : game.player.gender === "male" ? "男性" : ""
        }。請開始我的現代死亡劇情。`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.player]);

  async function triggerSummarize() {
    try {
      const convs = messages
        .filter((m) => m.role !== "system")
        .map((m, i) => ({
          round_number: Math.floor(i / 2),
          role: m.role,
          content: m.content,
          phase: game.phase,
        }));

      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversations: convs.slice(memory.lastSummarizedRound * 2, game.roundNumber * 2),
          startRound: memory.lastSummarizedRound + 1,
          endRound: game.roundNumber,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        dispatch({
          type: "UPDATE_MEMORY",
          payload: {
            storySummaries: [data.summary],
            lastSummarizedRound: game.roundNumber,
            ...(data.facts && {
              keyFacts: {
                enemies: data.facts.new_enemies || [],
                allies: data.facts.new_allies || [],
                promises: data.facts.new_promises || [],
                secrets: data.facts.new_secrets || [],
                kills: data.facts.new_kills || [],
                learned_skills: [],
                visited_places: data.facts.new_places || [],
                important_items: data.facts.new_items || [],
              },
            }),
          },
        });
      }
    } catch {
      // Silent fail
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handlePhaseTransition(nextPhase: "reincarnation" | "story" | "ending" | "export") {
    dispatch({ type: "SET_PHASE", payload: nextPhase });
    const locationMap: Record<string, string> = {
      reincarnation: "輪迴",
      story: "金華城",
      ending: "蘭若寺",
    };
    if (locationMap[nextPhase]) {
      dispatch({ type: "SET_LOCATION", payload: locationMap[nextPhase] });
    }
  }

  const phaseButton = getPhaseButton(game.phase, game.roundNumber);

  return (
    <div className="h-[100dvh] flex flex-col items-center">
      {/* Header Bar */}
      <header className="w-full max-w-3xl shrink-0 px-3 sm:px-6 pt-3 sm:pt-4">
        <div className="glass-panel rounded-xl px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full border border-gold/30 flex items-center justify-center text-sm text-gold shrink-0">
              {game.isDaytime ? "☀" : "🌙"}
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm text-gold font-bold truncate tracking-wider">
                {game.player?.character || "倩女幽魂"}
              </h1>
              <p className="text-[10px] sm:text-xs text-ghost-white/30 truncate">
                {PHASE_LABELS[game.phase]} · {game.currentLocation} · 第{game.roundNumber}輪
              </p>
            </div>
          </div>

          {phaseButton && (
            <button
              onClick={() => handlePhaseTransition(phaseButton.phase)}
              className="btn-ancient rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider shrink-0 whitespace-nowrap"
            >
              {phaseButton.label}
            </button>
          )}
        </div>
      </header>

      {/* Chat Area — Centered Panel */}
      <div className="flex-1 w-full max-w-3xl overflow-hidden flex flex-col px-3 sm:px-6 py-3">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 pr-1"
        >
          {/* Phase intro */}
          {messages.length <= 1 && (
            <div className="text-center py-8 animate-fade-in">
              <div className="ancient-divider mx-auto max-w-[160px] mb-4">❖</div>
              <p className="text-ghost-white/30 text-xs tracking-widest">
                {game.phase === "death" ? "命運的序幕正在揭開⋯⋯" : "故事繼續⋯⋯"}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {loading && (
            <div className="flex items-center justify-center gap-3 py-4 animate-fade-in">
              <span className="text-lg animate-ghost-float">🕯️</span>
              <span className="text-ghost-white/30 text-sm tracking-wider">
                命運的筆正在書寫⋯⋯
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="w-full max-w-3xl shrink-0 px-3 sm:px-6 pb-3 sm:pb-4 safe-bottom">
        <form
          onSubmit={handleSubmit}
          className="glass-panel rounded-xl p-2 sm:p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="輸入你的行動⋯⋯"
              rows={1}
              disabled={loading}
              className="flex-1 input-ancient rounded-lg px-3 sm:px-4 py-2.5 text-[15px] resize-none disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn-jade rounded-lg px-4 sm:px-5 py-2.5 text-sm font-bold tracking-wider transition-all disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
            >
              發送
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ===== Phase Button Logic ===== */
function getPhaseButton(phase: string, round: number) {
  if (phase === "death" && round >= 6)
    return { phase: "reincarnation" as const, label: "⟐ 進入輪迴" };
  if (phase === "reincarnation" && round >= 2)
    return { phase: "story" as const, label: "⟐ 開始故事" };
  if (phase === "story" && round >= 20)
    return { phase: "ending" as const, label: "⟐ 走向結局" };
  if (phase === "ending")
    return { phase: "export" as const, label: "⟐ 匯出故事" };
  return null;
}

/* ===== Message Bubble ===== */
function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="text-center py-3 animate-fade-in">
        <span className="text-xs text-blood-red/70 bg-blood-red/5 border border-blood-red/10 rounded-lg px-4 py-1.5 inline-block">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-ink-spread`}>
      <div className={`max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 ${
        isUser ? "msg-user" : "msg-assistant"
      }`}>
        {isUser && (
          <div className="text-[10px] text-ghost-white/30 mb-1.5 tracking-wider">— 你 —</div>
        )}
        <div className={`text-[15px] leading-relaxed whitespace-pre-wrap ${
          isUser ? "text-ghost-white/95" : "text-ghost-white/90"
        }`}>
          {message.content}
        </div>
        {!isUser && message.model && (
          <div className="text-[9px] text-gold/25 mt-3 text-right tracking-wider uppercase">
            {message.model}
          </div>
        )}
      </div>
    </div>
  );
}
