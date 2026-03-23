"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface StoryCard {
  id: string;
  title: string;
  totalWords: number;
  chapterCount: number;
  character: string | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export default function ProfilePage() {
  const params = useParams();
  const authorName = decodeURIComponent(params.name as string);
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedInName, setLoggedInName] = useState<string | null>(null);
  const [loggedInId, setLoggedInId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const pname = sessionStorage.getItem("playerName");
    const pid = sessionStorage.getItem("playerId");
    if (pname) setLoggedInName(pname);
    if (pid) setLoggedInId(pid);
  }, []);

  useEffect(() => {
    fetch(`/api/gallery?author=${encodeURIComponent(authorName)}`)
      .then((r) => r.json())
      .then((d) => setStories(d.stories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authorName]);

  const isOwner = loggedInName === authorName;

  async function handleDelete(storyId: string) {
    try {
      await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, playerId: loggedInId, isPublic: false }),
      });
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      setConfirmDeleteId(null);
    } catch {}
  }

  function timeAgo(d: string) {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return "剛剛";
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  return (
    <div className="min-h-screen bg-night text-ghost-white font-serif">
      <header className="border-b border-gold/20 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/gallery" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">← 返回作品牆</a>
          <a href="/" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">返回遊戲</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">🏮</div>
          <h1 className="text-xl text-gold font-bold tracking-widest">{authorName}</h1>
          <p className="text-xs text-ghost-white/40 mt-2">{stories.length} 部作品</p>
        </div>

        {loading && <div className="text-center py-16 text-ghost-white/30">載入中⋯</div>}

        <div className="grid gap-4">
          {stories.map((s) => (
            <div key={s.id} className="relative glass-panel rounded-xl p-5 hover:border-gold/30 transition-all">
              <a href={`/story/${s.id}`} className="block">
                <h2 className="text-gold font-bold tracking-wider mb-1">{s.title}</h2>
                <div className="flex items-center gap-3 text-xs text-ghost-white/40">
                  <span>{s.character}</span>
                  <span>{s.totalWords} 字</span>
                  <span>{s.chapterCount} 章</span>
                  <span>♥ {s.likesCount}</span>
                  <span>💬 {s.commentsCount}</span>
                  <span>{timeAgo(s.createdAt)}</span>
                </div>
              </a>

              {/* Delete button — only for owner */}
              {isOwner && (
                confirmDeleteId === s.id ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-night/90 rounded-lg p-2 border border-blood-red/20">
                    <span className="text-[10px] text-ghost-white/50">確定刪除？</span>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-[10px] text-blood-red border border-blood-red/30 rounded px-2 py-0.5 hover:bg-blood-red/10"
                    >
                      確定
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] text-ghost-white/40 border border-ghost-white/10 rounded px-2 py-0.5"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(s.id)}
                    className="absolute top-3 right-3 text-[10px] text-ghost-white/20 hover:text-blood-red/50 transition-colors"
                  >
                    刪除
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {!loading && stories.length === 0 && (
          <div className="text-center py-16 text-ghost-white/30">此玩家尚無公開作品</div>
        )}
      </main>
    </div>
  );
}
