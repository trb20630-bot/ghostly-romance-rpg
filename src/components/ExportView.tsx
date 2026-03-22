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
        body: JSON.stringify({
          conversations,
          playerProfile: game.player,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "匯出失敗");
      }

      const data: StoryExport = await res.json();
      setStory(data);
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
      ...story.chapters.map(
        (ch) => `## ${ch.title}\n\n${ch.content}\n`
      ),
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

  function handleNewGame() {
    dispatch({ type: "RESET" });
  }

  // Not yet exported
  if (!story) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center animate-fade-in-up">
          <div className="text-6xl mb-6">📜</div>
          <h1 className="text-2xl font-serif font-bold text-gold mb-4">
            故事已完結
          </h1>
          <p className="text-ghost-white/60 text-sm mb-8">
            你的倩女幽魂之旅即將化為一篇完整的故事。
            <br />
            共計 {messages.filter((m) => m.role !== "system").length} 段對話，
            {game.roundNumber} 輪冒險。
          </p>

          {error && (
            <p className="text-blood-red text-sm mb-4">{error}</p>
          )}

          <button
            onClick={handleExport}
            disabled={loading}
            className="px-8 py-3 rounded-xl bg-gold/80 hover:bg-gold text-night font-serif font-bold text-lg transition-all disabled:opacity-50"
          >
            {loading ? "正在編纂故事⋯⋯" : "匯出為小說"}
          </button>

          <button
            onClick={handleNewGame}
            className="block mx-auto mt-4 text-sm text-ghost-white/40 hover:text-ghost-white/60 transition-colors"
          >
            重新開始
          </button>
        </div>
      </div>
    );
  }

  // Story viewer
  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif font-bold text-gold mb-2">
            {story.title}
          </h1>
          <p className="text-ghost-white/40 text-sm">
            共 {story.totalWords} 字 · {story.chapters.length} 章
          </p>
        </div>

        {/* Chapters */}
        <div className="space-y-10">
          {story.chapters.map((ch) => (
            <article
              key={ch.number}
              className="bg-night-light/50 rounded-xl p-6 md:p-8 border border-jade/10 paper-texture"
            >
              <h2 className="text-xl font-serif font-bold text-jade mb-4">
                {ch.title}
              </h2>
              <div className="text-sm text-ghost-white/80 leading-loose whitespace-pre-wrap font-serif">
                {ch.content}
              </div>
            </article>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-4 mt-10 mb-20">
          <button
            onClick={downloadMarkdown}
            className="px-6 py-3 rounded-xl bg-jade/80 hover:bg-jade text-white font-serif transition-all"
          >
            下載 Markdown
          </button>
          <button
            onClick={handleNewGame}
            className="px-6 py-3 rounded-xl border border-ghost-white/20 text-ghost-white/60 hover:text-ghost-white hover:border-ghost-white/40 font-serif transition-all"
          >
            重新開始
          </button>
        </div>
      </div>
    </div>
  );
}
