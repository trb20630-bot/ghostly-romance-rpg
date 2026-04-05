"use client";

import { useState, useRef, useCallback } from "react";
import { useGame } from "./GameProvider";
import { detectSceneFromContent, SCENE_BGM } from "@/lib/scene-bgm";
import type { StoryExport } from "@/types/game";
import GameIcon from "./GameIcon";

type PlayState = "idle" | "loading" | "playing" | "paused";

export default function ExportView({ playerId, onBackToSlots }: { playerId?: string; onBackToSlots?: () => void }) {
  const { state, dispatch } = useGame();
  const [story, setStory] = useState<StoryExport & { storyExportId?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);
  const [shareAnonymous, setShareAnonymous] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  // TTS state
  const [rate, setRate] = useState(1);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [currentChapter, setCurrentChapter] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [mp3Loading, setMp3Loading] = useState(false);
  const [mp3Progress, setMp3Progress] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  const { game, messages } = state;

  async function handleExport() {
    setLoading(true);
    setError("");
    setExportProgress("準備中...");
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
          sessionId: game.sessionId,
          playerId,
        }),
      });

      if (!res.ok) {
        // 安全處理非 JSON 錯誤回應
        const text = await res.text();
        if (text.startsWith("[ERROR]")) {
          throw new Error(text.replace("[ERROR] ", ""));
        }
        try {
          const err = JSON.parse(text);
          throw new Error(err.error || "匯出失敗");
        } catch {
          throw new Error(text.slice(0, 200) || "匯出失敗");
        }
      }

      // 讀取串流回應
      const reader = res.body?.getReader();
      if (!reader) throw new Error("無法讀取回應串流");

      const decoder = new TextDecoder();
      const chapters: Array<{ number: number; title: string; content: string }> = [];
      let storyTitle = "";
      let totalWords = 0;
      let storyExportId: string | undefined;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // 保留不完整的最後一行

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith("[PROGRESS] ")) {
            setExportProgress(line.replace("[PROGRESS] ", ""));
          } else if (line.startsWith("[CHAPTER] ")) {
            const parts = line.replace("[CHAPTER] ", "").split("|");
            const num = parseInt(parts[0]);
            const title = parts[1];
            const content = (parts.slice(2).join("|")).replace(/\\n/g, "\n");
            chapters.push({ number: num, title, content });
          } else if (line.startsWith("[DONE] ")) {
            const parts = line.replace("[DONE] ", "").split("|");
            storyTitle = parts[0];
            totalWords = parseInt(parts[1]) || 0;
            if (parts[3]) storyExportId = parts[3];
          } else if (line.startsWith("[ERROR] ")) {
            throw new Error(line.replace("[ERROR] ", ""));
          }
          // [CHAPTER_ERROR] — 章節已被加入為錯誤佔位，繼續處理
        }
      }

      if (chapters.length === 0) {
        throw new Error("匯出未產生任何章節");
      }

      setStory({
        title: storyTitle || `那些關於我轉生成為${game.player?.character || ""}的那件事`,
        chapters,
        totalWords: totalWords || chapters.reduce((s, c) => s + c.content.length, 0),
        exportedAt: new Date().toISOString(),
        storyExportId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯出失敗");
    } finally {
      setLoading(false);
      setExportProgress("");
    }
  }

  // ===== TTS fetch =====
  const fetchAudio = useCallback(async (text: string): Promise<Blob> => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "smart", rate }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "語音合成失敗" }));
      throw new Error(err.error || "語音合成失敗");
    }
    return res.blob();
  }, [rate]);

  // ===== Playback with scene-based BGM switching =====
  async function handlePlay() {
    if (!story) return;
    if (playState === "paused" && audioRef.current) {
      audioRef.current.play();
      setPlayState("playing");
      return;
    }

    abortRef.current = false;
    setPlayState("loading");
    setTotalChapters(story.chapters.length);
    setError("");
    dispatch({ type: "SET_TTS_PLAYING", payload: true });

    for (let i = 0; i < story.chapters.length; i++) {
      if (abortRef.current) break;
      setCurrentChapter(i + 1);

      // 根據章節內容切換 BGM
      const scene = detectSceneFromContent(story.chapters[i].title, story.chapters[i].content);
      dispatch({ type: "SET_SCENE_TAG", payload: scene });

      try {
        const text = `${story.chapters[i].title}。${story.chapters[i].content}`;
        const blob = await fetchAudio(text);
        if (abortRef.current) break;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("播放失敗")); };
          audio.play().catch(reject);
          setPlayState("playing");
        });
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : "朗讀失敗");
        }
        break;
      }
    }

    dispatch({ type: "SET_TTS_PLAYING", payload: false });
    if (!abortRef.current) {
      setPlayState("idle");
      setCurrentChapter(0);
    }
  }

  function handlePause() {
    if (audioRef.current && playState === "playing") {
      audioRef.current.pause();
      setPlayState("paused");
    }
  }

  function handleStop() {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayState("idle");
    setCurrentChapter(0);
    dispatch({ type: "SET_TTS_PLAYING", payload: false });
  }

  // ===== MP3 download with BGM mixed at 20% =====
  async function handleDownloadMp3() {
    if (!story) return;
    setMp3Loading(true);
    setMp3Progress("準備中...");
    setError("");

    try {
      const ctx = new AudioContext();
      const mixedBuffers: AudioBuffer[] = [];

      for (let i = 0; i < story.chapters.length; i++) {
        if (abortRef.current) break;
        const ch = story.chapters[i];
        setMp3Progress(`語音合成 ${i + 1}/${story.chapters.length}...`);

        // 取得 TTS 語音
        const text = `${ch.title}。${ch.content}`;
        let remaining = text;
        const chunkBuffers: AudioBuffer[] = [];
        while (remaining.length > 0) {
          const chunk = remaining.slice(0, 5000);
          remaining = remaining.slice(5000);
          const blob = await fetchAudio(chunk);
          const arrayBuf = await blob.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(arrayBuf);
          chunkBuffers.push(audioBuf);
        }

        // 合併章節 chunks
        const ttsBuffer = chunkBuffers.length === 1
          ? chunkBuffers[0]
          : concatAudioBuffers(ctx, chunkBuffers);

        // 載入對應場景 BGM
        const scene = detectSceneFromContent(ch.title, ch.content);
        const bgmUrl = SCENE_BGM[scene] || SCENE_BGM.LANRUO;

        setMp3Progress(`混音 ${i + 1}/${story.chapters.length}...`);

        try {
          const bgmRes = await fetch(bgmUrl);
          const bgmArrayBuf = await bgmRes.arrayBuffer();
          const bgmBuffer = await ctx.decodeAudioData(bgmArrayBuf);

          // 混合：語音 100% + BGM 20%，BGM loop 到語音長度
          const mixed = mixAudioBuffers(ctx, ttsBuffer, bgmBuffer, 1.0, 0.2);
          mixedBuffers.push(mixed);
        } catch {
          // BGM 載入失敗，僅用語音
          mixedBuffers.push(ttsBuffer);
        }
      }

      setMp3Progress("編碼中...");

      // 合併所有章節
      const finalBuffer = concatAudioBuffers(ctx, mixedBuffers);

      // 編碼為 WAV（瀏覽器原生支援，無需外部庫）
      const wavBlob = audioBufferToWav(finalBuffer);

      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${story.title}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      ctx.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "MP3 下載失敗");
    } finally {
      setMp3Loading(false);
      setMp3Progress("");
    }
  }

  // ===== Download helpers =====
  function buildTxt(): string {
    if (!story) return "";
    return [
      story.title,
      "=".repeat(story.title.length * 2),
      "",
      ...story.chapters.flatMap((ch) => [ch.title, "-".repeat(ch.title.length * 2), "", ch.content, "", ""]),
      `共 ${story.totalWords} 字`,
      `匯出於 ${new Date(story.exportedAt).toLocaleString("zh-TW")}`,
    ].join("\n");
  }

  function downloadTxt() {
    if (!story) return;
    const blob = new Blob([buildTxt()], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${story.title}.txt`);
  }

  function downloadPdf() {
    if (!story) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const html = `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="utf-8"><title>${story.title}</title><style>body{font-family:"Noto Serif TC",serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1a1a2e;line-height:1.8}h1{text-align:center;font-size:24px;margin-bottom:8px}h2{font-size:18px;margin-top:40px;border-bottom:1px solid #ccc;padding-bottom:6px}p{text-indent:2em;margin:.5em 0}.meta{text-align:center;color:#888;font-size:12px;margin-top:40px}@media print{body{margin:0}}</style></head><body><h1>${story.title}</h1>${story.chapters.map((ch) => `<h2>${ch.title}</h2>${ch.content.split("\n").filter(Boolean).map((l) => `<p>${l}</p>`).join("")}`).join("")}<div class="meta">共 ${story.totalWords} 字 · 匯出於 ${new Date(story.exportedAt).toLocaleString("zh-TW")}</div><script>window.onload=function(){window.print()}</script></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== Pre-export screen =====
  if (!story) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center animate-fade-in-up">
          <div className="glass-panel ancient-frame corner-decor rounded-2xl p-8 sm:p-10">
            <div className="text-5xl mb-6 animate-ghost-float">📜</div>
            <h1 className="text-2xl font-bold text-gold tracking-widest mb-3">
              {game.phase === "export" ? "故 事 已 完 結" : "匯 出 故 事"}
            </h1>
            <div className="ancient-divider mx-auto max-w-[160px] mb-4">❖</div>
            <p className="text-ghost-white/85 text-sm mb-8 leading-relaxed">
              {game.phase === "export"
                ? "你的倩女幽魂之旅即將化為一篇完整的故事。"
                : "將目前的冒險進度匯出為小說。"}
              <br />
              <span className="text-gold/60">
                共 {messages.filter((m) => m.role !== "system").length} 段對話，{game.roundNumber} 輪冒險。
              </span>
            </p>
            {error && (
              <p className="text-blood-red text-sm mb-4 bg-blood-red/5 border border-blood-red/10 rounded-lg px-4 py-2">{error}</p>
            )}
            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full btn-ancient rounded-xl py-3.5 text-lg tracking-widest font-bold disabled:opacity-40 mb-4"
            >
              {loading ? (exportProgress || "正在編纂故事⋯⋯") : "匯 出 為 小 說"}
            </button>
            <div className="flex justify-center gap-4">
              {game.phase !== "export" && (
                <button onClick={() => dispatch({ type: "SET_PHASE", payload: "story" })} className="text-sm text-ghost-white/50 hover:text-ghost-white/85 transition-colors tracking-wider">返回遊戲</button>
              )}
              {onBackToSlots && (
                <button onClick={onBackToSlots} className="text-sm text-ghost-white/50 hover:text-ghost-white/85 transition-colors tracking-wider">返回角色列表</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Story viewer =====
  return (
    <div className="min-h-[100dvh] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto animate-fade-in-up py-6">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">{story.title}</h1>
          <div className="ancient-divider mx-auto max-w-[200px] my-4">❖</div>
          <p className="text-ghost-white/50 text-sm">共 {story.totalWords} 字 · {story.chapters.length} 章</p>
        </div>

        {/* TTS Player Panel */}
        <div className="glass-panel rounded-xl p-5 mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-gold/80 text-sm font-bold tracking-wider">語音朗讀</h3>
            <span className="text-[10px] text-ghost-white/30">智慧多角色語音 + 場景音樂</span>
          </div>

          <div className="text-[10px] text-ghost-white/40 leading-relaxed bg-ghost-white/3 rounded-lg px-3 py-2">
            旁白：Yunyang · 寧采臣：Yunxi · 燕赤霞：Yunze · 聶小倩：Xiaoxiao · 姥姥：Xiaochen · 其他自動分配
          </div>

          {/* Rate slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-ghost-white/40">語速</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              onInput={(e) => setRate(Number((e.target as HTMLInputElement).value))}
              disabled={playState !== "idle"}
              className="flex-1 h-6 disabled:opacity-40"
            />
            <span className="text-xs text-gold/60 tabular-nums w-8">{rate}x</span>
          </div>

          {/* Playback controls */}
          <div className="flex flex-wrap items-center gap-2">
            {playState === "idle" && (
              <button onClick={handlePlay} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">
                朗讀故事
              </button>
            )}
            {playState === "loading" && (
              <button disabled className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider opacity-40">
                載入中⋯
              </button>
            )}
            {playState === "playing" && (
              <button onClick={handlePause} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">
                暫停
              </button>
            )}
            {playState === "paused" && (
              <button onClick={handlePlay} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">
                繼續
              </button>
            )}
            {playState !== "idle" && (
              <button onClick={handleStop} className="border border-ghost-white/10 text-ghost-white/50 hover:text-blood-red/70 hover:border-blood-red/30 rounded-lg px-4 py-2 text-xs tracking-wider transition-all">
                停止
              </button>
            )}
            <button
              onClick={handleDownloadMp3}
              disabled={mp3Loading || playState !== "idle"}
              className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider disabled:opacity-40"
            >
              {mp3Loading ? mp3Progress || "生成中⋯" : "下載有聲書"}
            </button>
          </div>

          {/* Progress */}
          {playState !== "idle" && totalChapters > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-ghost-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold/50 rounded-full transition-all"
                  style={{ width: `${(currentChapter / totalChapters) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-ghost-white/40 tabular-nums">
                {currentChapter} / {totalChapters} 章
              </span>
            </div>
          )}

          {error && (
            <p className="text-blood-red text-xs bg-blood-red/5 border border-blood-red/10 rounded-lg px-3 py-1.5">{error}</p>
          )}
        </div>

        {/* Chapters */}
        <div className="space-y-8">
          {story.chapters.map((ch) => (
            <article key={ch.number} className="glass-panel ancient-frame rounded-2xl p-6 sm:p-8">
              <h2 className="text-lg sm:text-xl font-bold text-gold mb-1 tracking-wider">{ch.title}</h2>
              <div className="ancient-divider mb-5">✦</div>
              <div className="text-sm text-ghost-white/85 leading-loose whitespace-pre-wrap">{ch.content}</div>
            </article>
          ))}
        </div>

        {/* Share Panel */}
        {story.storyExportId && (
          <div className="glass-panel rounded-xl p-5 mt-8 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-gold/80 text-sm font-bold tracking-wider flex items-center gap-1.5"><GameIcon name="share" size={16} />分享作品</h3>
              {shared && <span className="text-[10px] text-jade">已公開分享</span>}
            </div>
            {!shared ? (
              showShareOptions ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-xs text-ghost-white/60 cursor-pointer">
                    <input type="checkbox" checked={shareAnonymous} onChange={(e) => setShareAnonymous(e.target.checked)} className="accent-gold" />
                    匿名分享（不顯示帳號名稱）
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await fetch("/api/share", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ storyId: story.storyExportId, playerId, isPublic: true, isAnonymous: shareAnonymous }),
                        });
                        setShared(true);
                        setShowShareOptions(false);
                      }}
                      className="btn-jade rounded-lg px-4 py-2 text-xs tracking-wider font-bold"
                    >
                      確認分享
                    </button>
                    <button onClick={() => setShowShareOptions(false)} className="text-xs text-ghost-white/40 hover:text-ghost-white/60">取消</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowShareOptions(true)} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">
                  <GameIcon name="share" size={14} className="mr-1" />分享到作品牆
                </button>
              )
            ) : (
              <div className="flex items-center gap-3">
                <a href="/gallery" className="text-xs text-gold hover:underline">查看作品牆</a>
                <button
                  onClick={async () => {
                    await fetch("/api/share", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ storyId: story.storyExportId, playerId, isPublic: false }),
                    });
                    setShared(false);
                  }}
                  className="text-xs text-ghost-white/30 hover:text-blood-red/60 transition-colors"
                >
                  取消公開
                </button>
              </div>
            )}
          </div>
        )}

        {/* Download Actions */}
        <div className="flex flex-wrap justify-center gap-3 mt-8 mb-16">
          <button onClick={downloadPdf} className="btn-jade rounded-xl px-5 py-3 text-sm tracking-wider font-bold">下載 PDF</button>
          <button onClick={downloadTxt} className="btn-ancient rounded-xl px-5 py-3 text-sm tracking-wider">下載 TXT</button>
          <a href="/gallery" className="btn-ancient rounded-xl px-5 py-3 text-sm tracking-wider inline-block text-center">作品牆</a>
          {onBackToSlots && (
            <button onClick={onBackToSlots} className="btn-ancient rounded-xl px-5 py-3 text-sm tracking-wider">返回角色列表</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Audio utility functions =====

/** 合併多個 AudioBuffer */
function concatAudioBuffers(ctx: AudioContext, buffers: AudioBuffer[]): AudioBuffer {
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const channels = buffers[0]?.numberOfChannels || 1;
  const sampleRate = buffers[0]?.sampleRate || 44100;
  const output = ctx.createBuffer(channels, totalLength, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const outData = output.getChannelData(ch);
    let offset = 0;
    for (const buf of buffers) {
      const chIdx = ch < buf.numberOfChannels ? ch : 0;
      outData.set(buf.getChannelData(chIdx), offset);
      offset += buf.length;
    }
  }
  return output;
}

/** 混合兩個 AudioBuffer（語音 + BGM loop） */
function mixAudioBuffers(
  ctx: AudioContext,
  voice: AudioBuffer,
  bgm: AudioBuffer,
  voiceVol: number,
  bgmVol: number
): AudioBuffer {
  const length = voice.length;
  const channels = Math.max(voice.numberOfChannels, bgm.numberOfChannels);
  const output = ctx.createBuffer(channels, length, voice.sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const outData = output.getChannelData(ch);
    const voiceCh = ch < voice.numberOfChannels ? ch : 0;
    const voiceData = voice.getChannelData(voiceCh);
    const bgmCh = ch < bgm.numberOfChannels ? ch : 0;
    const bgmData = bgm.getChannelData(bgmCh);

    for (let i = 0; i < length; i++) {
      const v = voiceData[i] * voiceVol;
      const b = bgmData[i % bgm.length] * bgmVol; // loop BGM
      outData[i] = Math.max(-1, Math.min(1, v + b)); // clamp
    }
  }
  return output;
}

/** AudioBuffer → WAV Blob */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, headerSize + dataSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave channels
  let offset = headerSize;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
