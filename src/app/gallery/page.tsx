"use client";

import { useState, useEffect } from "react";

interface StoryCard {
  id: string;
  title: string;
  totalWords: number;
  chapterCount: number;
  character: string | null;
  characterName: string | null;
  authorName: string;
  authorId: string | null;
  likesCount: number;
  viewsCount: number;
  commentsCount: number;
  createdAt: string;
}

export default function GalleryPage() {
  const [stories, setStories] = useState<StoryCard[]>([]);
  const [sort, setSort] = useState<"latest" | "popular">("latest");
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
    setLoading(true);
    fetch(`/api/gallery?sort=${sort}`)
      .then((r) => r.json())
      .then((d) => setStories(d.stories || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sort]);

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
          <h1 className="text-gold font-bold tracking-widest text-lg">作 品 牆</h1>
          <a href="/" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">返回遊戲</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex gap-4 mb-8 border-b border-gold/10">
          {([["latest", "最新"], ["popular", "最熱門"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSort(v)}
              className={`pb-3 text-sm tracking-wider transition-all ${sort === v ? "text-gold border-b-2 border-gold" : "text-ghost-white/40 hover:text-ghost-white/60"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-16 text-ghost-white/30">載入中⋯</div>}

        {!loading && stories.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">📜</div>
            <p className="text-ghost-white/30">尚無公開作品</p>
            <p className="text-ghost-white/20 text-xs mt-2">完成故事後點擊「分享作品」就能在這裡展示</p>
          </div>
        )}

        <div className="grid gap-4">
          {stories.map((s) => {
            const isOwner = loggedInName && s.authorId === loggedInName;

            return (
              <div key={s.id} className="relative glass-panel rounded-xl p-5 hover:border-gold/30 transition-all">
                <a href={`/story/${s.id}`} className="block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-gold font-bold tracking-wider mb-1 truncate">{s.title}</h2>
                      <div className="flex items-center gap-2 text-xs text-ghost-white/40 mb-2">
                        <span>{s.character === "聶小倩" ? "幽" : "書"} {s.character}</span>
                        {s.characterName && <span>· {s.characterName}</span>}
                        <span>· {s.totalWords} 字</span>
                        <span>· {s.chapterCount} 章</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-ghost-white/30">
                        {s.authorId ? (
                          <span
                            className="hover:text-gold cursor-pointer"
                            onClick={(e) => { e.preventDefault(); window.location.href = `/profile/${s.authorId}`; }}
                          >
                            {s.authorName}
                          </span>
                        ) : (
                          <span>{s.authorName}</span>
                        )}
                        <span>{timeAgo(s.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-ghost-white/30 shrink-0">
                      <span title="按讚">♥ {s.likesCount}</span>
                      <span title="留言">💬 {s.commentsCount}</span>
                    </div>
                  </div>
                </a>

                {/* Delete — bottom-right, away from likes */}
                {isOwner && (
                  <div className="flex justify-end mt-2 pt-2 border-t border-ghost-white/5">
                    {confirmDeleteId === s.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-ghost-white/40">確定要刪除這篇作品嗎？</span>
                        <button onClick={() => handleDelete(s.id)} className="text-[10px] text-blood-red border border-blood-red/30 rounded px-2.5 py-1 hover:bg-blood-red/10">確定刪除</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-[10px] text-ghost-white/40 border border-ghost-white/10 rounded px-2.5 py-1">取消</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.preventDefault(); setConfirmDeleteId(s.id); }}
                        className="text-[10px] text-ghost-white/20 hover:text-blood-red/50 transition-colors"
                      >
                        刪除作品
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
