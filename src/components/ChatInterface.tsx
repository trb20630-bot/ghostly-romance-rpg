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

const LOCATION_EMOJI: Record<string, string> = {
  現代: "🏙️",
  輪迴: "🌀",
  金華城: "🏯",
  蘭若寺: "🏚️",
  蘭若寺地下: "🕳️",
  墓地: "⚰️",
};

export default function ChatInterface() {
  const { state, dispatch } = useGame();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const autoStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { game, messages, memory } = state;

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Send message to API
  const sendMessage = useCallback(
    async (text: string) => {
      if (loading) return;
      setLoading(true);

      // Add user message
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", payload: userMsg });

      try {
        const recentHistory = getRecentHistory(
          [...messages, userMsg],
          15
        );

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

        // Add assistant message
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message,
          timestamp: Date.now(),
          model: data.model,
        };
        dispatch({ type: "ADD_MESSAGE", payload: assistantMsg });
        dispatch({ type: "INCREMENT_ROUND" });

        // Trigger summarize every 10 rounds
        if ((game.roundNumber + 1) % 10 === 0 && game.roundNumber > 0) {
          triggerSummarize();
        }
      } catch (err) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: `錯誤：${err instanceof Error ? err.message : "未知錯誤"}`,
          timestamp: Date.now(),
        };
        dispatch({ type: "ADD_MESSAGE", payload: errorMsg });
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, game, memory, dispatch]
  );

  // Auto-start: send initial message for death phase (useRef prevents double-fire in StrictMode)
  useEffect(() => {
    if (
      game.phase === "death" &&
      messages.length === 0 &&
      !autoStartedRef.current &&
      game.player
    ) {
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
          conversations: convs.slice(
            memory.lastSummarizedRound * 2,
            game.roundNumber * 2
          ),
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
      // Silent fail for summarize
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

  // Phase transition buttons
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

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="shrink-0 border-b border-jade/20 bg-night-light/80 backdrop-blur-sm px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base sm:text-lg shrink-0">
              {LOCATION_EMOJI[game.currentLocation] || "📍"}
            </span>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-serif text-gold truncate">
                {game.player?.character || "倩女幽魂"}
              </h1>
              <p className="text-[10px] sm:text-xs text-ghost-white/40 truncate">
                {PHASE_LABELS[game.phase] || game.phase} · {game.currentLocation} · {game.isDaytime ? "白晝" : "夜晚"} · 第{game.roundNumber}輪
              </p>
            </div>
          </div>

          {/* Phase transition controls */}
          <div className="shrink-0">
            {game.phase === "death" && game.roundNumber >= 6 && (
              <button
                onClick={() => handlePhaseTransition("reincarnation")}
                className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded border border-lantern/40 text-lantern hover:bg-lantern/10 transition-colors whitespace-nowrap"
              >
                進入輪迴
              </button>
            )}
            {game.phase === "reincarnation" && game.roundNumber >= 2 && (
              <button
                onClick={() => handlePhaseTransition("story")}
                className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded border border-jade/40 text-jade hover:bg-jade/10 transition-colors whitespace-nowrap"
              >
                開始故事
              </button>
            )}
            {game.phase === "story" && game.roundNumber >= 20 && (
              <button
                onClick={() => handlePhaseTransition("ending")}
                className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded border border-gold/40 text-gold hover:bg-gold/10 transition-colors whitespace-nowrap"
              >
                走向結局
              </button>
            )}
            {game.phase === "ending" && (
              <button
                onClick={() => handlePhaseTransition("export")}
                className="text-[10px] sm:text-xs px-2 sm:px-3 py-1 rounded border border-blood-red/40 text-blood-red hover:bg-blood-red/10 transition-colors whitespace-nowrap"
              >
                匯出故事
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4"
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-ghost-white/40 text-sm animate-pulse">
            <span className="animate-ghost-float">🕯️</span>
            <span className="font-serif">命運的筆正在書寫⋯⋯</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-jade/20 bg-night-light/80 backdrop-blur-sm p-2 sm:p-4 safe-bottom"
      >
        <div className="flex items-end gap-2 sm:gap-3 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="輸入你的行動⋯⋯"
            rows={1}
            disabled={loading}
            className="flex-1 bg-night border border-ghost-white/20 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm text-ghost-white placeholder:text-ghost-white/30 focus:outline-none focus:border-jade resize-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-jade/80 hover:bg-jade text-white text-sm font-serif transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            發送
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "system") {
    return (
      <div className="text-center text-xs text-blood-red/80 py-2">
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}
    >
      <div
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-jade/20 border border-jade/30 text-ghost-white"
            : "bg-night-light border border-ghost-white/10 text-ghost-white/90 paper-texture"
        }`}
      >
        <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif">
          {message.content}
        </div>
        {!isUser && message.model && (
          <div className="text-[10px] text-ghost-white/20 mt-2 text-right">
            {message.model}
          </div>
        )}
      </div>
    </div>
  );
}
