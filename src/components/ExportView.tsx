"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";
import type { StoryExport } from "@/types/game";

export default function ExportView() {
  const { state, dispatch } = useGame();
  const [story, setStory] = useState<StoryExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { game, messages } = state;

  async function handleExport() {
    setLoading(true);
    setError("");
    try {
      const conversations = messages
        .filter((m) => m.role !== "system")
        .map((m, i) => ({
          round_number: Math.floor(i / 2),
          role: m.role,
          content: m.content,
          phase: game.phase,
        }));

      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations, playerProfile: game.player }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "匯出失敗");
      }
      setStory(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯出失敗");
    } finally {
      setLoading(false);
    }
  }

  function downloadMarkdown() {
    if (!story) return;
    const md = [
      `# ${story.title}\n`,
      ...story.chapters.map((ch) => `## ${ch.title}\n\n${ch.content}\n`),
      `---\n*共 ${story.totalWords} 字 · 匯出於 ${new Date(story.exportedAt).toLocaleString("zh-TW")}*`,
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${story.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Pre-export screen
  if (!story) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center animate-fade-in-up">
          <div className="glass-panel ancient-frame corner-decor rounded-2xl p-8 sm:p-10">
            <div className="text-5xl mb-6 animate-ghost-float">📜</div>
            <h1 className="text-2xl font-bold text-gold tracking-widest mb-3">
              故 事 已 完 結
            </h1>
            <div className="ancient-divider mx-auto max-w-[160px] mb-4">❖</div>
            <p className="text-ghost-white/50 text-sm mb-8 leading-relaxed">
              你的倩女幽魂之旅即將化為一篇完整的故事。
              <br />
              <span className="text-gold/40">
                共 {messages.filter((m) => m.role !== "system").length} 段對話，{game.roundNumber} 輪冒險。
              </span>
            </p>

            {error && (
              <p className="text-blood-red text-sm mb-4 bg-blood-red/5 border border-blood-red/10 rounded-lg px-4 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full btn-ancient rounded-xl py-3.5 text-lg tracking-widest font-bold disabled:opacity-40 mb-4"
            >
              {loading ? "正在編纂故事⋯⋯" : "匯 出 為 小 說"}
            </button>

            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="text-sm text-ghost-white/25 hover:text-ghost-white/50 transition-colors tracking-wider"
            >
              重新開始
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Story viewer
  return (
    <div className="min-h-[100dvh] p-4 sm:p-8 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in-up py-6">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">
            {story.title}
          </h1>
          <div className="ancient-divider mx-auto max-w-[200px] my-4">❖</div>
          <p className="text-ghost-white/30 text-sm">
            共 {story.totalWords} 字 · {story.chapters.length} 章
          </p>
        </div>

        {/* Chapters */}
        <div className="space-y-8">
          {story.chapters.map((ch) => (
            <article
              key={ch.number}
              className="glass-panel ancient-frame rounded-2xl p-6 sm:p-8"
            >
              <h2 className="text-lg sm:text-xl font-bold text-gold mb-1 tracking-wider">
                {ch.title}
              </h2>
              <div className="ancient-divider mb-5">✦</div>
              <div className="text-sm text-ghost-white/70 leading-loose whitespace-pre-wrap">
                {ch.content}
              </div>
            </article>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 mt-10 mb-16">
          <button
            onClick={downloadMarkdown}
            className="btn-jade rounded-xl px-6 py-3 tracking-wider"
          >
            下載 Markdown
          </button>
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="btn-ancient rounded-xl px-6 py-3 tracking-wider"
          >
            重新開始
          </button>
        </div>
      </div>
    </div>
  );
}
