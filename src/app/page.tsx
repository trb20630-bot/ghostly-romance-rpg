"use client";

import { useState, useEffect, useCallback } from "react";
import { GameProvider, useGame } from "@/components/GameProvider";
import AuthScreen from "@/components/AuthScreen";
import SlotSelect from "@/components/SlotSelect";
import SetupPhase from "@/components/SetupPhase";
import CharacterSelect from "@/components/CharacterSelect";
import ChatInterface from "@/components/ChatInterface";
import ExportView from "@/components/ExportView";
import BgmPlayer from "@/components/BgmPlayer";
import type { ChatMessage, PlayerMemory, GamePhase } from "@/types/game";
import { setAuthToken, clearAuthToken, authFetch, getAuthToken } from "@/lib/api-client";
import { cleanSceneTag } from "@/lib/scene-bgm";
import AnnouncementModal from "@/components/AnnouncementModal";
import InviteModal from "@/components/InviteModal";
import GameIcon from "@/components/GameIcon";

interface PlayerInfo {
  id: string;
  name: string;
}

interface SessionInfo {
  id: string;
  slot_number: number;
  character_name: string | null;
  chosen_character: string | null;
  player_occupation: string | null;
  player_age: number | null;
  player_gender: string | null;
  phase: string;
  round_number: number;
  current_location: string;
  is_daytime: boolean;
  updated_at: string;
}

type Screen = "auth" | "slots" | "game";

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [entered, setEntered] = useState(false);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSession, setActiveSession] = useState<SessionInfo | null>(null);
  const [savedMemory, setSavedMemory] = useState<PlayerMemory | null>(null);
  const [savedConversations, setSavedConversations] = useState<
    Array<{ round_number: number; role: string; content: string; phase: string }>
  >([]);
  const [newSlotNumber, setNewSlotNumber] = useState<number>(1);
  const [showInvite, setShowInvite] = useState(false);

  // LINE Login callback：從 URL 讀取 token 並自動登入
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const lineToken = params.get("line_token");
    const linePlayerId = params.get("line_player_id");
    const linePlayerName = params.get("line_player_name");

    if (lineToken && linePlayerId && linePlayerName) {
      // 清除 URL 參數
      window.history.replaceState({}, "", "/");

      // 設定 auth 並進入大廳
      setAuthToken(lineToken);
      sessionStorage.setItem("playerId", linePlayerId);
      sessionStorage.setItem("playerName", linePlayerName);

      const playerInfo = { id: linePlayerId, name: linePlayerName };
      setPlayer(playerInfo);
      setEntered(true);

      // 取得 sessions
      authFetch("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "verify" }),
      })
        .then((r) => r.json())
        .then((data) => {
          setSessions(data.sessions || []);
          setScreen("slots");
          // 首次彈出邀請 Modal
          const inviteKey = `invite_shown_${linePlayerId}`;
          if (!localStorage.getItem(inviteKey)) {
            localStorage.setItem(inviteKey, "1");
            setTimeout(() => setShowInvite(true), 800);
          }
        })
        .catch(() => setScreen("slots"));
      return; // LINE callback handled, skip session restore
    }

    // 處理 LINE 錯誤
    const lineError = params.get("line_error");
    if (lineError) {
      window.history.replaceState({}, "", "/");
      console.warn("[LINE Login] Error:", lineError);
    }

    // Auto-restore session：檢查 sessionStorage 是否有有效 JWT
    const existingToken = getAuthToken();
    if (existingToken) {
      authFetch("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "verify" }),
      })
        .then((r) => {
          if (!r.ok) throw new Error("Token invalid");
          return r.json();
        })
        .then((data) => {
          if (data.player) {
            setPlayer({ id: data.player.id, name: data.player.name });
            setSessions(data.sessions || []);
            sessionStorage.setItem("playerId", data.player.id);
            sessionStorage.setItem("playerName", data.player.name);
            setEntered(true);
            setScreen("slots");
          }
        })
        .catch(() => {
          // Token 過期或無效，清除並留在 auth 畫面
          clearAuthToken();
          sessionStorage.removeItem("playerId");
          sessionStorage.removeItem("playerName");
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat: update online status every 2 minutes
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => {
      void fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", playerId: player.id }),
      });
    }, 120000);
    return () => clearInterval(interval);
  }, [player]);

  // Login handler — now goes to slot select
  function handleLogin(result: { player: { id: string; name: string }; sessions: SessionInfo[]; token?: string }) {
    setPlayer(result.player);
    setSessions(result.sessions);
    setScreen("slots");
    // Save auth token + player info
    if (result.token) {
      setAuthToken(result.token);
    }
    sessionStorage.setItem("playerId", result.player.id);
    sessionStorage.setItem("playerName", result.player.name);
    // 每帳號彈一次邀請 Modal
    const inviteKey = `invite_shown_${result.player.id}`;
    if (!localStorage.getItem(inviteKey)) {
      localStorage.setItem(inviteKey, "1");
      setTimeout(() => setShowInvite(true), 800);
    }
  }

  const [syncing, setSyncing] = useState(false);

  // Load a specific session and enter game
  async function handleSelectSession(sessionId: string) {
    if (!player) return;
    setSyncing(true);
    try {
      const res = await authFetch("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          action: "load_session",
          playerId: player.id,
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 如果後端檢測到問題，顯示同步提示
      if (data.contextIssues && data.contextIssues.length > 0) {
        console.warn("Context issues detected:", data.contextIssues);
      }

      setActiveSession(data.session);
      if (data.memory) {
        setSavedMemory({
          keyFacts: (data.memory.key_facts as PlayerMemory["keyFacts"]) || {
            enemies: [], allies: [], promises: [], secrets: [],
            kills: [], learned_skills: [], visited_places: [], important_items: [],
            completed_events: [],
          },
          storySummaries: (data.memory.story_summaries as string[]) || [],
          lastSummarizedRound: (data.memory.last_summarized_round as number) || 0,
        });
      } else {
        setSavedMemory(null);
      }
      setSavedConversations(data.conversations || []);
      setScreen("game");
    } catch (err) {
      console.error("Load session error:", err);
    } finally {
      setSyncing(false);
    }
  }

  // Start a new game (go to setup)
  function handleNewGame(slotNumber: number) {
    setNewSlotNumber(slotNumber);
    setActiveSession(null);
    setSavedMemory(null);
    setSavedConversations([]);
    setScreen("game");
  }

  function handleLogout() {
    setPlayer(null);
    setSessions([]);
    setActiveSession(null);
    setScreen("auth");
    clearAuthToken();
    sessionStorage.removeItem("playerId");
    sessionStorage.removeItem("playerName");
  }

  async function handleBackToSlots() {
    setActiveSession(null);
    setSavedMemory(null);
    setSavedConversations([]);
    setScreen("slots");
    // Refresh session list via API (no page reload — preserves login + audio context)
    try {
      const res = await authFetch("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: "verify" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // Silent fail — user still sees the (possibly stale) session list
    }
  }

  // Splash screen — user clicks to enter, which unlocks audio
  if (!entered) {
    return (
      <div
        className="h-[100dvh] flex items-center justify-center cursor-pointer"
        onClick={() => setEntered(true)}
      >
        <div className="text-center animate-fade-in-up">
          <div className="mb-6 animate-ghost-float"><GameIcon name="lantern" size={108} /></div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gold tracking-[0.3em] mb-4">
            倩 女 幽 魂
          </h1>
          <p className="text-ghost-white/40 text-sm tracking-wider mb-10">
            那些關於我轉生成為聶小倩／寧采臣的那件事
          </p>
          <div className="ancient-divider mx-auto max-w-[200px] mb-8">❖</div>
          <p className="text-gold/50 text-xs tracking-widest animate-pulse">
            — 點 擊 進 入 —
          </p>
        </div>
      </div>
    );
  }

  if (screen === "auth" || !player) {
    return (<><BgmPlayer phase="login" /><AuthScreen onLogin={handleLogin} /></>);
  }

  if (screen === "slots") {
    return (
      <>
        <BgmPlayer phase="login" />
        <AnnouncementModal />
        {syncing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm">
            <div className="text-center animate-fade-in">
              <div className="animate-ghost-float mb-4"><GameIcon name="candle" size={72} /></div>
              <p className="text-gold text-sm tracking-widest">正在同步遊戲資料...</p>
            </div>
          </div>
        )}
        <SlotSelect
          playerId={player.id}
          playerName={player.name}
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onNewGame={handleNewGame}
          onLogout={handleLogout}
        />
        {showInvite && (
          <InviteModal
            playerId={player.id}
            onClose={() => setShowInvite(false)}
          />
        )}
      </>
    );
  }

  return (
    <GameProvider>
      <GameRouterWithBgm
        player={player}
        savedSession={activeSession}
        savedMemory={savedMemory}
        savedConversations={savedConversations}
        slotNumber={newSlotNumber}
        onBackToSlots={handleBackToSlots}
      />
    </GameProvider>
  );
}

function GameRouter({
  player,
  savedSession,
  savedMemory,
  savedConversations,
  slotNumber,
  onBackToSlots,
}: {
  player: PlayerInfo;
  savedSession: SessionInfo | null;
  savedMemory: PlayerMemory | null;
  savedConversations: Array<{ round_number: number; role: string; content: string; phase: string }>;
  slotNumber: number;
  onBackToSlots: () => void;
}) {
  const { state, dispatch } = useGame();
  const [restored, setRestored] = useState(false);

  // Restore saved game state on mount
  useEffect(() => {
    if (restored) return;
    setRestored(true);

    if (savedSession) {
      dispatch({
        type: "SET_PLAYER",
        payload: {
          id: player.id,
          characterName: savedSession.character_name || "",
          age: savedSession.player_age || 25,
          gender: (savedSession.player_gender as "male" | "female" | "other") || "male",
          occupation: savedSession.player_occupation || "",
          character: (savedSession.chosen_character as "聶小倩" | "寧采臣") || "寧采臣",
        },
      });
      dispatch({ type: "SET_SESSION_ID", payload: savedSession.id });
      dispatch({ type: "SET_PHASE", payload: savedSession.phase as GamePhase });
      dispatch({ type: "SET_LOCATION", payload: savedSession.current_location });
      dispatch({ type: "SET_DAYTIME", payload: savedSession.is_daytime ?? true });

      for (let i = 0; i < savedSession.round_number; i++) {
        dispatch({ type: "INCREMENT_ROUND" });
      }

      if (savedConversations.length > 0) {
        for (const conv of savedConversations) {
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: crypto.randomUUID(),
              role: conv.role as "user" | "assistant",
              content: conv.role === "assistant" ? cleanSceneTag(conv.content) : conv.content,
              timestamp: Date.now(),
            },
          });
        }
      }

      if (savedMemory) {
        dispatch({ type: "UPDATE_MEMORY", payload: savedMemory });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prompt for character name if old save doesn't have one
  const [namePromptInput, setNamePromptInput] = useState("");
  const needsName = savedSession && !savedSession.character_name && state.game.player && !state.game.player.characterName && state.game.phase !== "setup" && state.game.phase !== "character";

  if (needsName) {
    return (
      <div className="h-[100dvh] flex items-center justify-center p-4">
        <div className="max-w-sm w-full animate-fade-in-up">
          <div className="glass-panel ancient-frame corner-decor rounded-2xl p-7 text-center space-y-5">
            <div className="animate-ghost-float"><GameIcon name="lantern" size={72} /></div>
            <h2 className="text-xl text-gold font-bold tracking-widest">為你的角色命名</h2>
            <p className="text-xs text-ghost-white/60 leading-relaxed">這個名字將用於遊戲中和匯出的故事</p>
            <input
              type="text"
              value={namePromptInput}
              onChange={(e) => setNamePromptInput(e.target.value)}
              placeholder="輸入角色名字⋯"
              maxLength={20}
              className="w-full input-ancient rounded-lg px-4 py-3 text-[15px] text-ghost-white text-center"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && namePromptInput.trim()) {
                  dispatch({ type: "SET_PLAYER", payload: { ...state.game.player!, characterName: namePromptInput.trim() } });
                  // Save to DB
                  if (state.game.sessionId) {
                    void authFetch("/api/game", {
                      method: "PATCH",
                      body: JSON.stringify({ sessionId: state.game.sessionId, character_name: namePromptInput.trim() }),
                    });
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (!namePromptInput.trim()) return;
                dispatch({ type: "SET_PLAYER", payload: { ...state.game.player!, characterName: namePromptInput.trim() } });
                if (state.game.sessionId) {
                  void fetch("/api/game", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: state.game.sessionId, character_name: namePromptInput.trim() }),
                  });
                }
              }}
              disabled={!namePromptInput.trim()}
              className="w-full btn-jade rounded-xl py-3 text-base tracking-widest font-bold disabled:opacity-20"
            >
              確 認
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isExport = state.game.phase === "export";

  let content;
  switch (state.game.phase) {
    case "setup":
      content = <SetupPhase playerId={player.id} slotNumber={slotNumber} onBack={onBackToSlots} />;
      break;
    case "character":
      content = <CharacterSelect playerId={player.id} slotNumber={slotNumber} />;
      break;
    case "death":
    case "reincarnation":
    case "story":
    case "ending":
      content = <ChatInterface playerId={player.id} onBackToSlots={onBackToSlots} />;
      break;
    case "export":
      content = <ExportView playerId={player.id} onBackToSlots={onBackToSlots} />;
      break;
    default:
      content = <SetupPhase playerId={player.id} slotNumber={slotNumber} onBack={onBackToSlots} />;
  }

  return (
    <>
      <BgmPlayer phase={state.game.phase} location={state.game.currentLocation} sceneTag={state.game.sceneTag} ducking={state.game.ttsPlaying} showSelector={isExport} />
      {content}
    </>
  );
}

// Wrapper that puts BgmPlayer inside GameProvider context
function GameRouterWithBgm(props: {
  player: PlayerInfo;
  savedSession: SessionInfo | null;
  savedMemory: PlayerMemory | null;
  savedConversations: Array<{ round_number: number; role: string; content: string; phase: string }>;
  slotNumber: number;
  onBackToSlots: () => void;
}) {
  return <GameRouter {...props} />;
}
