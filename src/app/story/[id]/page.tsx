"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import SharePanel from "@/components/SharePanel";
import BgmPlayer from "@/components/BgmPlayer";
import GameIcon from "@/components/GameIcon";
import { detectSceneFromContent } from "@/lib/scene-bgm";

interface Chapter { number: number; title: string; content: string; }
interface Comment { id: string; user_name: string; content: string; created_at: string; }
interface StoryData {
  title: string;
  chapters: Chapter[];
  totalWords: number;
  authorName: string;
  authorId: string | null;
  character: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

export default function StoryPage() {
  const params = useParams();
  const storyId = params.id as string;

  const [story, setStory] = useState<StoryData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // TTS state for "read all"
  const [readingAll, setReadingAll] = useState(false);
  const readAllAudioRef = useRef<HTMLAudioElement | null>(null);
  const readAllAbortRef = useRef(false);
  const [currentScene, setCurrentScene] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("路人");

  useEffect(() => {
    const pid = sessionStorage.getItem("playerId");
    const pname = sessionStorage.getItem("playerName");
    if (pid) setPlayerId(pid);
    if (pname) setPlayerName(pname);
  }, []);

  // Load all data
  useEffect(() => {
    if (!storyId) return;

    async function loadStory() {
      try {
        // 1. Fetch metadata from gallery
        const galleryRes = await fetch(`/api/gallery?sort=latest`);
        const galleryData = await galleryRes.json();
        const meta = (galleryData.stories || []).find((x: { id: string }) => x.id === storyId);

        // 2. Fetch full chapters
        const chapterRes = await fetch(`/api/gallery/story?id=${storyId}`);
        const chapterData = await chapterRes.json();

        if (meta) {
          setStory({
            title: meta.title,
            chapters: chapterData.chapters || [],
            totalWords: meta.totalWords,
            authorName: meta.authorName,
            authorId: meta.authorId,
            character: meta.character,
            likesCount: meta.likesCount,
            commentsCount: meta.commentsCount,
            createdAt: meta.createdAt,
          });
        } else if (chapterData.chapters) {
          // Fallback: just show chapters without metadata
          setStory({
            title: "作品",
            chapters: chapterData.chapters,
            totalWords: 0,
            authorName: "未知",
            authorId: null,
            character: "",
            likesCount: 0,
            commentsCount: 0,
            createdAt: "",
          });
        }
      } catch (err) {
        console.error("Load story error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadStory();

    // Fetch comments
    fetch(`/api/comments?storyId=${storyId}`)
      .then((r) => r.json())
      .then((d) => setComments(d.comments || []))
      .catch(() => {});
  }, [storyId]);

  async function handleLike() {
    if (!playerId) return;
    const res = await fetch("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, userId: playerId }),
    });
    const d = await res.json();
    setLiked(d.liked);
    if (story) {
      setStory({ ...story, likesCount: story.likesCount + (d.liked ? 1 : -1) });
    }
  }

  async function handleComment() {
    if (!newComment.trim()) return;
    setCommentError("");
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, userId: playerId, userName: playerName, content: newComment.trim() }),
    });
    const d = await res.json();
    if (!res.ok) { setCommentError(d.error || "留言失敗"); return; }
    setNewComment("");
    const res2 = await fetch(`/api/comments?storyId=${storyId}`);
    const d2 = await res2.json();
    setComments(d2.comments || []);
  }

  async function handleReadAll() {
    if (!story) return;
    if (readingAll) {
      readAllAbortRef.current = true;
      readAllAudioRef.current?.pause();
      readAllAudioRef.current = null;
      setReadingAll(false);
      return;
    }
    readAllAbortRef.current = false;
    setReadingAll(true);
    for (const ch of story.chapters) {
      if (readAllAbortRef.current) break;
      // 根據章節內容切換 BGM
      const scene = detectSceneFromContent(ch.title, ch.content);
      setCurrentScene(scene);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `${ch.title}。${ch.content}`, mode: "smart" }),
        });
        if (!res.ok || readAllAbortRef.current) break;
        const blob = await res.blob();
        if (readAllAbortRef.current) break;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        readAllAudioRef.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => resolve());
        });
      } catch { break; }
    }
    setReadingAll(false);
    setCurrentScene(null);
    readAllAudioRef.current = null;
  }

  function timeAgo(d: string) {
    if (!d) return "";
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return "剛剛";
    if (mins < 60) return `${mins} 分鐘前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小時前`;
    return `${Math.floor(hours / 24)} 天前`;
  }

  if (loading) {
    return <div className="min-h-screen bg-night flex items-center justify-center text-ghost-white/30">載入中⋯</div>;
  }
  if (!story) {
    return <div className="min-h-screen bg-night flex items-center justify-center text-ghost-white/30">找不到作品</div>;
  }

  const isOwner = playerName && story.authorId === playerName;

  return (
    <div className="min-h-screen bg-night text-ghost-white font-serif">
      <BgmPlayer phase="export" sceneTag={currentScene} showSelector />

      <header className="border-b border-gold/20 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <a href="/gallery" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">← 返回作品牆</a>
          <div className="flex items-center gap-3">
            {isOwner && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-ghost-white/40">確定刪除？</span>
                  <button
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await fetch("/api/share", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ storyId, playerId, isPublic: false }),
                        });
                        window.location.href = "/gallery";
                      } catch {} finally { setDeleting(false); }
                    }}
                    disabled={deleting}
                    className="text-[10px] text-blood-red border border-blood-red/30 rounded px-2 py-1 hover:bg-blood-red/10 disabled:opacity-40"
                  >
                    {deleting ? "⋯" : "確定"}
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] text-ghost-white/40 border border-ghost-white/10 rounded px-2 py-1">取消</button>
                </div>
              ) : (
                <button onClick={() => setShowDeleteConfirm(true)} className="text-[10px] text-ghost-white/30 hover:text-blood-red/60 transition-colors">刪除作品</button>
              )
            )}
            <a href="/" className="text-xs text-ghost-white/50 hover:text-gold transition-colors">返回遊戲</a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">{story.title}</h1>
          <div className="flex items-center justify-center gap-3 text-xs text-ghost-white/40 mt-3">
            {story.authorId ? (
              <a href={`/profile/${story.authorId}`} className="hover:text-gold transition-colors">{story.authorName}</a>
            ) : (
              <span>{story.authorName}</span>
            )}
            {story.character && <><span>·</span><span>{story.character}</span></>}
            {story.totalWords > 0 && <><span>·</span><span>{story.totalWords} 字</span></>}
            {story.createdAt && <><span>·</span><span>{timeAgo(story.createdAt)}</span></>}
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleLike}
              className={`btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider ${liked ? "text-blood-red border-blood-red/40" : ""}`}
            >
              {liked ? "♥" : "♡"} {story.likesCount}
            </button>
            <span className="text-xs text-ghost-white/30">💬 {comments.length}</span>
            <button
              onClick={handleReadAll}
              className={`rounded-lg px-3 py-2 text-xs tracking-wider transition-all ${readingAll ? "btn-ancient text-gold" : "text-ghost-white/30 border border-ghost-white/10 hover:border-gold/20 hover:text-gold/60"}`}
            >
              {readingAll ? <>⏹ 停止朗讀</> : <><GameIcon name="sound" size={20} className="inline-block align-middle" /> 朗讀全文</>}
            </button>
            <SharePanel
              storyId={storyId}
              title={story.title}
              authorName={story.authorName}
              character={story.character}
              excerpt={story.chapters.length > 0 ? story.chapters[0].content.slice(0, 100) : ""}
              storyUrl={typeof window !== "undefined" ? window.location.href : ""}
            />
          </div>
        </div>

        {/* Story Content */}
        {story.chapters.length > 0 ? (
          <div className="space-y-8">
            {story.chapters.map((ch) => (
              <article key={ch.number} className="glass-panel ancient-frame rounded-2xl p-6 sm:p-8">
                <h2 className="text-lg sm:text-xl font-bold text-gold mb-1 tracking-wider">{ch.title}</h2>
                <div className="ancient-divider mb-5">✦</div>
                <div className="text-sm text-ghost-white/85 leading-loose whitespace-pre-wrap">{ch.content}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-ghost-white/20">此作品尚無內容</div>
        )}

        {/* Comments Section */}
        <div className="mt-12 glass-panel rounded-xl p-6 space-y-5">
          <h3 className="text-gold/80 text-sm font-bold tracking-wider">留言 ({comments.length})</h3>

          <div className="space-y-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
              placeholder="寫下你的感想⋯⋯"
              rows={2}
              className="w-full input-ancient rounded-lg px-4 py-2.5 text-sm text-ghost-white resize-none"
            />
            {commentError && <p className="text-blood-red text-xs">{commentError}</p>}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-ghost-white/20">{newComment.length}/500</span>
              <button
                onClick={handleComment}
                disabled={!newComment.trim()}
                className="btn-ancient rounded-lg px-4 py-1.5 text-xs tracking-wider disabled:opacity-20"
              >
                發送留言
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-ghost-white/3 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gold/60">{c.user_name}</span>
                  <span className="text-[10px] text-ghost-white/20">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-sm text-ghost-white/70 leading-relaxed">{c.content}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-center text-xs text-ghost-white/20 py-4">還沒有留言，來當第一個吧！</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
