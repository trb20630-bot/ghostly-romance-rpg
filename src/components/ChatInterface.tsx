"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useGame } from "./GameProvider";
import { getRecentHistory } from "@/lib/game-store";
import { extractSceneTag, cleanSceneTag, isAbnormalTransition, logMusicSwitch, detectSceneFromContent, SCENE_BGM } from "@/lib/scene-bgm";
import type { ChatMessage } from "@/types/game";
import { authFetch } from "@/lib/api-client";

const PHASE_LABELS: Record<string, string> = {
  death: "現代篇",
  reincarnation: "輪迴",
  story: "主線故事",
  ending: "結局",
};


export default function ChatInterface({ playerId, onBackToSlots }: { playerId?: string; onBackToSlots?: () => void }) {
  const { state, dispatch } = useGame();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const autoStartedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const switchCountRef = useRef<{ round: number; count: number }>({ round: 0, count: 0 });

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareAnonymous, setShareAnonymous] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState<"success" | "error" | null>(null);

  // Music feedback state
  const [showMusicFeedback, setShowMusicFeedback] = useState(false);
  const [musicFeedbackText, setMusicFeedbackText] = useState("");
  const [musicFeedbackSending, setMusicFeedbackSending] = useState(false);
  const [musicFeedbackResult, setMusicFeedbackResult] = useState<"success" | "error" | null>(null);

  // Read-all TTS state
  const [readingAll, setReadingAll] = useState(false);
  const readAllAudioRef = useRef<HTMLAudioElement | null>(null);
  const readAllAbortRef = useRef(false);

  // Summarize retry state
  const summarizeRetryRef = useRef(0);
  const summarizePausedUntilRef = useRef(0);

  // Save state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const hasUnsavedRef = useRef(false);
  const lastSavedRoundRef = useRef(0);

  const { game, messages, memory } = state;

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // 關閉頁面前攔截：有未存檔變更或正在存檔時提示
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSavingRef.current || hasUnsavedRef.current) {
        e.preventDefault();
        const msg = isSavingRef.current
          ? "⚠️ 存檔尚未完成！請等待存檔完成後再離開，否則最新進度將會遺失。"
          : `⚠️ 你有第 ${lastSavedRoundRef.current + 1} 輪之後的冒險尚未存檔！\n\n請先點擊右上角「💾 存檔」按鈕保存進度，再關閉頁面。`;
        e.returnValue = msg;
        return msg;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // 心跳：每 30 秒更新 session 活動時間
  useEffect(() => {
    if (!game.sessionId) return;
    const sendHeartbeat = () => {
      authFetch("/api/save", {
        method: "PATCH",
        body: JSON.stringify({ sessionId: game.sessionId }),
      }).catch(() => {
        // 網路斷線時靜默失敗，不影響遊玩
      });
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(interval);
  }, [game.sessionId]);

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
        const recentHistory = getRecentHistory([...messages, userMsg], 10);
        const res = await authFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: text,
            gameState: game,
            memory,
            recentHistory,
            playerId,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "API 錯誤");
        }

        const data = await res.json();
        const rawResponse: string = data.message;

        // 空回覆保護
        if (!rawResponse || !rawResponse.trim()) {
          throw new Error("AI 回覆為空，請重新嘗試");
        }

        // 提取場景標記 → 切換 BGM
        // 優先用 AI 的 <!-- SCENE: XXX --> 標記，沒有時從內容推斷
        let sceneTag = extractSceneTag(rawResponse);
        if (!sceneTag) {
          sceneTag = detectSceneFromContent("", cleanSceneTag(rawResponse));
        }
        const prevScene = game.sceneTag;
        const currentRound = game.roundNumber + 1;

        if (sceneTag && sceneTag !== prevScene) {
          // 追蹤同一輪切換次數
          if (switchCountRef.current.round === currentRound) {
            switchCountRef.current.count++;
          } else {
            switchCountRef.current = { round: currentRound, count: 1 };
          }

          const tooFrequent = switchCountRef.current.count > 2;
          const abnormal = isAbnormalTransition(prevScene, sceneTag) || tooFrequent;

          dispatch({ type: "SET_SCENE_TAG", payload: sceneTag });

          // 記錄音樂切換（fire-and-forget）
          void logMusicSwitch({
            sessionId: game.sessionId,
            fromScene: prevScene,
            toScene: sceneTag,
            aiSnippet: cleanSceneTag(rawResponse).slice(0, 100),
            isAbnormal: abnormal,
          });
        }

        // 顯示用：移除場景標記
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: cleanSceneTag(rawResponse),
          timestamp: Date.now(),
          model: data.model,
        };
        dispatch({ type: "ADD_MESSAGE", payload: assistantMsg });

        // 立刻解鎖輸入框 — 存檔和摘要在背景完成
        setLoading(false);
        hasUnsavedRef.current = true;

        // 存檔 → INCREMENT_ROUND → 摘要（不阻塞 UI）
        const nextRound = game.roundNumber + 1;
        if (game.sessionId) {
          const saved = await autoSave(text, rawResponse, data.model, nextRound);
          if (saved) {
            hasUnsavedRef.current = false;
            lastSavedRoundRef.current = nextRound;
          } else {
            console.warn(`[sendMessage] autoSave failed for round ${nextRound}, proceeding anyway`);
          }
        }
        dispatch({ type: "INCREMENT_ROUND" });

        // 摘要觸發：首次 5 輪，之後每 10 輪（含暫停檢查）
        const unsummarizedRounds = nextRound - memory.lastSummarizedRound;
        const isFirstSummarize = memory.lastSummarizedRound === 0;
        const threshold = isFirstSummarize ? 5 : 10;
        if (unsummarizedRounds > threshold) {
          if (summarizePausedUntilRef.current > nextRound) {
            console.log(
              `[triggerSummarize] 暫停中，等待到第 ${summarizePausedUntilRef.current} 輪 ` +
              `(目前第 ${nextRound} 輪)`
            );
          } else {
            if (summarizePausedUntilRef.current > 0) {
              console.log("[triggerSummarize] 暫停結束，重新嘗試摘要...");
              summarizeRetryRef.current = 0;
              summarizePausedUntilRef.current = 0;
            }
            triggerSummarize();
          }
        }
      } catch (err) {
        setLoading(false);
        dispatch({
          type: "ADD_MESSAGE",
          payload: {
            id: crypto.randomUUID(),
            role: "system",
            content: `錯誤：${err instanceof Error ? err.message : "未知錯誤"}`,
            timestamp: Date.now(),
          },
        });
      }
    },
    [loading, messages, game, memory, dispatch]
  );

  // Auto-save conversation to Supabase（含重試 + 狀態指示）
  async function autoSave(userText: string, aiText: string, model: string, round: number): Promise<boolean> {
    isSavingRef.current = true;
    setSaveStatus("saving");
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await authFetch("/api/save", {
          method: "POST",
          body: JSON.stringify({
            sessionId: game.sessionId,
            roundNumber: round,
            userMessage: userText,
            assistantMessage: aiText,
            model,
            phase: game.phase,
            currentLocation: game.currentLocation,
            isDaytime: game.isDaytime,
          }),
        });

        if (res.ok) {
          isSavingRef.current = false;
          setSaveStatus("saved");
          saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
          console.log(`[autoSave] Round ${round} saved successfully`);
          return true;
        }

        const errText = await res.text().catch(() => "unknown");
        console.error(`[autoSave] API error (attempt ${attempt}/${MAX_RETRIES}): ${res.status} ${errText}`);
      } catch (err) {
        console.error(`[autoSave] Network error (attempt ${attempt}/${MAX_RETRIES}):`, err instanceof Error ? err.message : err);
      }

      if (attempt < MAX_RETRIES) {
        setSaveStatus("error");
        // 短暫等待再重試
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        setSaveStatus("saving");
      }
    }

    // 全部重試失敗
    isSavingRef.current = false;
    setSaveStatus("error");
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
    console.error(`[autoSave] Round ${round} failed after ${MAX_RETRIES} attempts`);
    return false;
  }

  // 手動存檔：重新存當前最後一輪
  async function handleManualSave() {
    if (isSavingRef.current || !game.sessionId) return;
    if (!hasUnsavedRef.current && lastSavedRoundRef.current >= game.roundNumber) {
      // 沒有未存檔的變更，閃一下「已儲存」
      setSaveStatus("saved");
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      return;
    }

    // 取最後一輪的 user/assistant 訊息
    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    const userMsgs = messages.filter((m) => m.role === "user");
    if (assistantMsgs.length === 0 || userMsgs.length === 0) return;

    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    const lastUser = userMsgs[userMsgs.length - 1];

    const saved = await autoSave(
      lastUser.content,
      lastAssistant.content,
      lastAssistant.model || "sonnet",
      game.roundNumber
    );
    if (saved) {
      hasUnsavedRef.current = false;
      lastSavedRoundRef.current = game.roundNumber;
    }
  }

  // 返回角色列表前先存檔
  async function handleSaveAndBack() {
    if (game.sessionId && hasUnsavedRef.current) {
      await handleManualSave();
    }
    onBackToSlots?.();
  }

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
    const attempt = summarizeRetryRef.current + 1;

    try {
      // 過濾掉 system 訊息
      const filtered = messages.filter((m) => m.role !== "system");

      // 計算 messages 中有幾輪（assistant 訊息數 = 完成的輪數）
      const totalPairsInMessages = filtered.filter((m) => m.role === "assistant").length;

      // 用 game.roundNumber 反推第一輪的真實 round_number
      const firstRound = game.roundNumber - totalPairsInMessages + 1;

      // 為每條訊息標記真實的 round_number
      const convs: Array<{ round_number: number; role: string; content: string; phase: string }> = [];
      let currentRound = firstRound;
      for (let i = 0; i < filtered.length; i++) {
        const msg = filtered[i];
        convs.push({
          round_number: currentRound,
          role: msg.role,
          content: msg.content,
          phase: game.phase,
        });
        if (msg.role === "assistant") {
          currentRound++;
        }
      }

      // 只取尚未摘要過的輪次對話
      const startRound = memory.lastSummarizedRound + 1;
      const endRound = game.roundNumber;
      const unsummarized = convs.filter(
        (c) => c.round_number >= startRound && c.round_number <= endRound
      );

      console.log(
        `[triggerSummarize] attempt ${attempt}/3 | convs range: ${firstRound}-${currentRound - 1}, ` +
        `startRound: ${startRound}, endRound: ${endRound}, ` +
        `unsummarized count: ${unsummarized.length}`
      );

      if (unsummarized.length === 0) {
        console.warn(
          "[triggerSummarize] No unsummarized conversations found. " +
          `messages pairs: ${totalPairsInMessages}, game.roundNumber: ${game.roundNumber}, ` +
          `lastSummarizedRound: ${memory.lastSummarizedRound}`
        );
        return;
      }

      // 30 秒 timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await authFetch("/api/summarize", {
          method: "POST",
          body: JSON.stringify({
            conversations: unsummarized,
            startRound,
            endRound,
            sessionId: game.sessionId,
            playerId,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 讀取 response body 一次（body 只能讀一次）
      const rawText = await res.text();

      if (!res.ok) {
        throw new Error(`API error ${res.status}: ${rawText.slice(0, 500)}`);
      }

      // 解析 JSON — 單獨 catch 以區分 parse 錯誤
      let data: { summary?: string; facts?: Record<string, string[]> };
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        console.error(
          `[triggerSummarize] JSON parse failed. Raw response (first 500 chars):\n` +
          rawText.slice(0, 500)
        );
        throw new Error(`JSON parse error: ${parseErr instanceof Error ? parseErr.message : "unknown"}`);
      }

      // 成功 — 更新記憶 + 重置重試計數
      dispatch({
        type: "UPDATE_MEMORY",
        payload: {
          storySummaries: data.summary ? [data.summary] : [],
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

      summarizeRetryRef.current = 0;
      console.log(
        `[triggerSummarize] Success: summarized rounds ${startRound}-${endRound}, ` +
        `facts extracted: ${data.facts ? "yes" : "no"}`
      );
    } catch (err) {
      // 不更新 lastSummarizedRound，讓下一輪自動重試
      summarizeRetryRef.current = attempt;

      if (err instanceof DOMException && err.name === "AbortError") {
        console.error(`[triggerSummarize] Timeout after 30s (attempt ${attempt}/3)`);
      } else {
        console.error(
          `[triggerSummarize] Failed (attempt ${attempt}/3):`,
          err instanceof Error ? err.message : err
        );
      }

      if (attempt >= 3) {
        const pauseUntil = game.roundNumber + 5;
        summarizePausedUntilRef.current = pauseUntil;
        console.warn(
          `[triggerSummarize] 連續失敗 ${attempt} 次，暫停摘要功能，` +
          `等待到第 ${pauseUntil} 輪後重試`
        );
      }
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
              <p className="text-[10px] sm:text-xs text-ghost-white/50 truncate">
                {PHASE_LABELS[game.phase]} · {game.currentLocation} · 第{game.roundNumber}輪
                {saveStatus === "saving" && <span className="ml-1 text-gold/60 animate-pulse"> 儲存中...</span>}
                {saveStatus === "saved" && <span className="ml-1 text-jade"> ✓ 已儲存</span>}
                {saveStatus === "error" && <span className="ml-1 text-red-400"> 儲存失敗</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Read All button */}
            {messages.filter((m) => m.role === "assistant").length > 0 && (
              <button
                onClick={async () => {
                  if (readingAll) {
                    readAllAbortRef.current = true;
                    readAllAudioRef.current?.pause();
                    readAllAudioRef.current = null;
                    setReadingAll(false);
                    dispatch({ type: "SET_TTS_PLAYING", payload: false });
                    return;
                  }
                  readAllAbortRef.current = false;
                  setReadingAll(true);
                  dispatch({ type: "SET_TTS_PLAYING", payload: true });
                  const aiMsgs = messages.filter((m) => m.role === "assistant");
                  for (const msg of aiMsgs) {
                    if (readAllAbortRef.current) break;
                    try {
                      const res = await fetch("/api/tts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: msg.content, mode: "smart" }),
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
                  dispatch({ type: "SET_TTS_PLAYING", payload: false });
                  readAllAudioRef.current = null;
                }}
                className={`rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider whitespace-nowrap transition-all ${
                  readingAll ? "btn-ancient text-gold border-gold/50" : "text-ghost-white/30 hover:text-gold/60 border border-transparent hover:border-gold/20"
                }`}
                title={readingAll ? "停止朗讀" : "朗讀全部"}
              >
                {readingAll ? "⏹ 停止" : "🔊 朗讀"}
              </button>
            )}
            {game.roundNumber >= 1 && (
              <>
                <button
                  onClick={handleManualSave}
                  disabled={isSavingRef.current}
                  className="btn-ancient rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider whitespace-nowrap disabled:opacity-40"
                  title="手動存檔"
                >
                  💾 存檔
                </button>
                <button
                  onClick={async () => {
                    if (game.sessionId && hasUnsavedRef.current) {
                      await handleManualSave();
                    }
                    dispatch({ type: "SET_PHASE", payload: "export" });
                  }}
                  className="btn-ancient rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider whitespace-nowrap"
                >
                  匯出故事
                </button>
                <button
                  onClick={async () => {
                    if (game.sessionId && hasUnsavedRef.current) {
                      await handleManualSave();
                    }
                    const charName = game.player?.characterName || game.player?.character || "";
                    setShareTitle(`那些關於我轉生成為${charName}的那件事`);
                    setShareResult(null);
                    setShowShareModal(true);
                  }}
                  className="btn-ancient rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider whitespace-nowrap"
                >
                  分享作品
                </button>
              </>
            )}
            <button
              onClick={() => { setMusicFeedbackResult(null); setMusicFeedbackText(""); setShowMusicFeedback(true); }}
              className="text-ghost-white/20 hover:text-gold/60 transition-colors text-sm"
              title="音樂不對？點我回報"
            >
              🎵
            </button>
            {onBackToSlots && (
              <button
                onClick={handleSaveAndBack}
                className="btn-ancient rounded-lg px-3 py-1.5 text-[10px] sm:text-xs tracking-wider whitespace-nowrap"
              >
                返回角色列表
              </button>
            )}
          </div>
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
              <p className="text-ghost-white/50 text-xs tracking-widest">
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
              <span className="text-ghost-white/50 text-sm tracking-wider">
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

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-night/80 backdrop-blur-sm">
          <div className="glass-panel ancient-frame corner-decor rounded-2xl p-6 sm:p-8 w-full max-w-sm animate-fade-in-up space-y-5">
            <h2 className="text-xl text-gold font-bold tracking-widest text-center">分享作品</h2>
            <div className="ancient-divider mx-auto max-w-[120px]">❖</div>

            {shareResult === "success" ? (
              <div className="text-center space-y-4">
                <p className="text-jade text-sm">作品已成功分享到作品牆！</p>
                <div className="flex justify-center gap-3">
                  <a href="/gallery" className="btn-jade rounded-lg px-4 py-2 text-xs tracking-wider">查看作品牆</a>
                  <button onClick={() => setShowShareModal(false)} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">關閉</button>
                </div>
              </div>
            ) : (
              <>
                {/* Title */}
                <div>
                  <label className="block text-xs text-gold/90 mb-2 tracking-widest">故事標題</label>
                  <input
                    type="text"
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    className="w-full input-ancient rounded-lg px-4 py-2.5 text-sm text-ghost-white"
                    maxLength={50}
                  />
                </div>

                {/* Anonymous */}
                <label className="flex items-center gap-2 text-xs text-ghost-white/60 cursor-pointer">
                  <input type="checkbox" checked={shareAnonymous} onChange={(e) => setShareAnonymous(e.target.checked)} className="accent-gold" />
                  匿名分享（不顯示帳號名稱）
                </label>

                <p className="text-[10px] text-ghost-white/30 leading-relaxed">
                  分享後，你的故事將公開在作品牆上，其他玩家可以閱讀、按讚和留言。你可以隨時在匯出頁面取消公開。
                </p>

                {shareResult === "error" && (
                  <p className="text-blood-red text-xs">分享失敗，請先匯出故事後再分享</p>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      setShareLoading(true);
                      setShareResult(null);
                      try {
                        // Quick share: save raw conversations directly (no AI processing)
                        const conversations = messages
                          .filter((m) => m.role !== "system")
                          .map((m) => ({ role: m.role, content: m.content, phase: game.phase }));

                        const res = await fetch("/api/share", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "quick_share",
                            sessionId: game.sessionId,
                            playerId,
                            title: shareTitle,
                            conversations,
                            character: game.player?.character,
                            isAnonymous: shareAnonymous,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "分享失敗");

                        setShareResult("success");
                      } catch {
                        setShareResult("error");
                      } finally {
                        setShareLoading(false);
                      }
                    }}
                    disabled={shareLoading || !shareTitle.trim()}
                    className="flex-1 btn-jade rounded-lg py-2.5 text-sm tracking-wider font-bold disabled:opacity-30"
                  >
                    {shareLoading ? "分享中⋯" : "確認分享"}
                  </button>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="btn-ancient rounded-lg px-4 py-2.5 text-sm tracking-wider"
                  >
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Music Feedback Modal */}
      {showMusicFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-night/80 backdrop-blur-sm">
          <div className="glass-panel ancient-frame corner-decor rounded-2xl p-6 sm:p-8 w-full max-w-sm animate-fade-in-up space-y-4">
            <h2 className="text-lg text-gold font-bold tracking-widest text-center">音樂回報</h2>
            <div className="ancient-divider mx-auto max-w-[120px]">❖</div>

            {musicFeedbackResult === "success" ? (
              <div className="text-center space-y-3">
                <p className="text-jade text-sm">感謝回報！我們會盡快處理。</p>
                <button onClick={() => setShowMusicFeedback(false)} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">關閉</button>
              </div>
            ) : (
              <>
                <p className="text-xs text-ghost-white/50 leading-relaxed">
                  當前場景：{game.sceneTag || "未知"} · 音樂：{game.sceneTag ? (SCENE_BGM[game.sceneTag]?.split("/").pop()?.replace(".mp3", "") || "未知") : "未知"}
                </p>
                <textarea
                  value={musicFeedbackText}
                  onChange={(e) => setMusicFeedbackText(e.target.value.slice(0, 500))}
                  placeholder="音樂跟劇情不搭？請描述你遇到的問題⋯"
                  rows={3}
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-sm text-ghost-white resize-none"
                  autoFocus
                />
                {musicFeedbackResult === "error" && (
                  <p className="text-blood-red text-xs">送出失敗，請稍後再試</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!musicFeedbackText.trim()) return;
                      setMusicFeedbackSending(true);
                      setMusicFeedbackResult(null);
                      try {
                        const recent = messages
                          .filter((m) => m.role !== "system")
                          .slice(-6)
                          .map((m) => `${m.role === "user" ? "玩家" : "AI"}：${m.content.slice(0, 150)}`)
                          .join("\n");
                        const res = await fetch("/api/music-feedback", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            sessionId: game.sessionId,
                            playerId,
                            currentScene: game.sceneTag,
                            currentMusic: game.sceneTag ? SCENE_BGM[game.sceneTag] : null,
                            recentDialogue: recent,
                            feedback: musicFeedbackText.trim(),
                          }),
                        });
                        if (!res.ok) throw new Error();
                        setMusicFeedbackResult("success");
                      } catch {
                        setMusicFeedbackResult("error");
                      } finally {
                        setMusicFeedbackSending(false);
                      }
                    }}
                    disabled={musicFeedbackSending || !musicFeedbackText.trim()}
                    className="flex-1 btn-jade rounded-lg py-2.5 text-sm tracking-wider font-bold disabled:opacity-30"
                  >
                    {musicFeedbackSending ? "送出中⋯" : "送出回報"}
                  </button>
                  <button
                    onClick={() => setShowMusicFeedback(false)}
                    className="btn-ancient rounded-lg px-4 py-2.5 text-sm tracking-wider"
                  >
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Split text into chunks for faster TTS ===== */
function splitForTts(text: string): string[] {
  const maxLen = 300;
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxLen && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

async function fetchTtsChunk(text: string): Promise<Blob | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mode: "smart" }),
    });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

/* ===== Message Bubble with TTS ===== */
function MessageBubble({ message }: { message: ChatMessage }) {
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const queueIdxRef = useRef(0);

  function cleanupQueue() {
    audioQueueRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioQueueRef.current = [];
    queueIdxRef.current = 0;
  }

  function playNextInQueue() {
    const queue = audioQueueRef.current;
    const idx = queueIdxRef.current;
    if (idx >= queue.length) {
      setTtsState("idle");
      audioRef.current = null;
      cleanupQueue();
      return;
    }
    const url = queue[idx];
    queueIdxRef.current = idx + 1;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      playNextInQueue();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      playNextInQueue();
    };
    audio.play().catch(() => playNextInQueue());
  }

  async function handleTts() {
    if (ttsState === "playing") {
      audioRef.current?.pause();
      setTtsState("paused");
      return;
    }
    if (ttsState === "paused" && audioRef.current) {
      audioRef.current.play();
      setTtsState("playing");
      return;
    }

    setTtsState("loading");
    cleanupQueue();

    const chunks = splitForTts(message.content);

    try {
      // Fetch first chunk immediately
      const firstBlob = await fetchTtsChunk(chunks[0]);
      if (!firstBlob) { setTtsState("idle"); return; }

      // Start playing first chunk right away
      const firstUrl = URL.createObjectURL(firstBlob);
      const firstAudio = new Audio(firstUrl);
      audioRef.current = firstAudio;
      setTtsState("playing");

      // Fetch remaining chunks in parallel while first plays
      const remainingPromise = chunks.length > 1
        ? Promise.all(chunks.slice(1).map(fetchTtsChunk))
        : Promise.resolve([]);

      // Set up first audio to chain to queue
      firstAudio.onended = () => {
        URL.revokeObjectURL(firstUrl);
        playNextInQueue();
      };
      firstAudio.onerror = () => {
        URL.revokeObjectURL(firstUrl);
        playNextInQueue();
      };
      firstAudio.play().catch(() => setTtsState("idle"));

      // Build queue from remaining chunks
      const remaining = await remainingPromise;
      audioQueueRef.current = remaining
        .filter((b): b is Blob => b !== null)
        .map((blob) => URL.createObjectURL(blob));
    } catch {
      setTtsState("idle");
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => { audioRef.current?.pause(); cleanupQueue(); };
  }, []);

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
      <div className={`relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 ${
        isUser ? "msg-user" : "msg-assistant"
      }`}>
        {isUser && (
          <div className="text-[10px] text-ghost-white/50 mb-1.5 tracking-wider">— 你 —</div>
        )}
        <div className={`text-[15px] leading-relaxed whitespace-pre-wrap ${
          isUser ? "text-ghost-white/95" : "text-ghost-white"
        }`}>
          {message.content}
        </div>
        {/* TTS button for AI messages */}
        {!isUser && (
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={handleTts}
              className={`text-[11px] px-2 py-1 rounded-md transition-all ${
                ttsState === "playing"
                  ? "text-gold border border-gold/40 bg-gold/5"
                  : ttsState === "loading"
                    ? "text-ghost-white/20"
                    : "text-ghost-white/25 hover:text-gold/60 hover:bg-gold/5 border border-transparent hover:border-gold/20"
              }`}
              title={ttsState === "playing" ? "暫停" : ttsState === "paused" ? "繼續" : "朗讀"}
            >
              {ttsState === "loading" ? "⋯" : ttsState === "playing" ? "⏸" : ttsState === "paused" ? "▶" : "🔊"}
            </button>
            {message.model && (
              <span className="text-[9px] text-gold/25 tracking-wider uppercase">{message.model}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
