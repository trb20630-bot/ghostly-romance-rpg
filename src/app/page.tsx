"use client";

import { useState } from "react";
import { GameProvider, useGame } from "@/components/GameProvider";
import AuthScreen from "@/components/AuthScreen";
import SetupPhase from "@/components/SetupPhase";
import CharacterSelect from "@/components/CharacterSelect";
import ChatInterface from "@/components/ChatInterface";
import ExportView from "@/components/ExportView";
import type { ChatMessage, PlayerMemory, GamePhase } from "@/types/game";

interface PlayerInfo {
  id: string;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SessionInfo = any;

export default function HomePage() {
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [savedSession, setSavedSession] = useState<SessionInfo | null>(null);
  const [savedMemory, setSavedMemory] = useState<PlayerMemory | null>(null);
  const [savedConversations, setSavedConversations] = useState<
    Array<{ round_number: number; role: string; content: string; phase: string }>
  >([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleLogin(result: any) {
    setPlayer(result.player);
    setSavedSession(result.session as SessionInfo | null);
    if (result.memory) {
      setSavedMemory({
        keyFacts: (result.memory.key_facts as PlayerMemory["keyFacts"]) || {
          enemies: [], allies: [], promises: [], secrets: [],
          kills: [], learned_skills: [], visited_places: [], important_items: [],
        },
        storySummaries: (result.memory.story_summaries as string[]) || [],
        lastSummarizedRound: (result.memory.last_summarized_round as number) || 0,
      });
    }
    setSavedConversations(result.conversations || []);
  }

  if (!player) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <GameProvider>
      <GameRouter
        player={player}
        savedSession={savedSession}
        savedMemory={savedMemory}
        savedConversations={savedConversations}
      />
    </GameProvider>
  );
}

function GameRouter({
  player,
  savedSession,
  savedMemory,
  savedConversations,
}: {
  player: PlayerInfo;
  savedSession: SessionInfo | null;
  savedMemory: PlayerMemory | null;
  savedConversations: Array<{ round_number: number; role: string; content: string; phase: string }>;
}) {
  const { state, dispatch } = useGame();
  const [restored, setRestored] = useState(false);

  // Restore saved game state on mount
  if (!restored) {
    setRestored(true);

    if (savedSession) {
      // Restore player profile
      dispatch({
        type: "SET_PLAYER",
        payload: {
          id: player.id,
          age: savedSession.player_age,
          gender: savedSession.player_gender as "male" | "female" | "other",
          occupation: savedSession.player_occupation,
          character: savedSession.chosen_character as "聶小倩" | "寧采臣",
        },
      });
      dispatch({ type: "SET_SESSION_ID", payload: savedSession.id });
      dispatch({ type: "SET_PHASE", payload: savedSession.phase });
      dispatch({ type: "SET_LOCATION", payload: savedSession.current_location });
      dispatch({ type: "SET_DAYTIME", payload: savedSession.is_daytime });

      // Restore round number
      for (let i = 0; i < savedSession.round_number; i++) {
        dispatch({ type: "INCREMENT_ROUND" });
      }

      // Restore conversations
      if (savedConversations.length > 0) {
        for (const conv of savedConversations) {
          dispatch({
            type: "ADD_MESSAGE",
            payload: {
              id: crypto.randomUUID(),
              role: conv.role as "user" | "assistant",
              content: conv.content,
              timestamp: Date.now(),
            },
          });
        }
      }

      // Restore memory
      if (savedMemory) {
        dispatch({ type: "UPDATE_MEMORY", payload: savedMemory });
      }
    }
  }

  switch (state.game.phase) {
    case "setup":
      return <SetupPhase playerId={player.id} />;
    case "character":
      return <CharacterSelect playerId={player.id} />;
    case "death":
    case "reincarnation":
    case "story":
    case "ending":
      return <ChatInterface playerId={player.id} />;
    case "export":
      return <ExportView />;
    default:
      return <SetupPhase playerId={player.id} />;
  }
}
