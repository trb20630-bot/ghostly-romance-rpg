"use client";

import { GameProvider, useGame } from "@/components/GameProvider";
import SetupPhase from "@/components/SetupPhase";
import CharacterSelect from "@/components/CharacterSelect";
import ChatInterface from "@/components/ChatInterface";
import ExportView from "@/components/ExportView";

function GameRouter() {
  const { state } = useGame();

  switch (state.game.phase) {
    case "setup":
      return <SetupPhase />;
    case "character":
      return <CharacterSelect />;
    case "death":
    case "reincarnation":
    case "story":
    case "ending":
      return <ChatInterface />;
    case "export":
      return <ExportView />;
    default:
      return <SetupPhase />;
  }
}

export default function HomePage() {
  return (
    <GameProvider>
      <GameRouter />
    </GameProvider>
  );
}
