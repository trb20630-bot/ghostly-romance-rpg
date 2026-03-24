"use client";

import { useGame } from "./GameProvider";
import { authFetch } from "@/lib/api-client";

const CHARACTERS = [
  {
    id: "聶小倩" as const,
    name: "聶 小 倩",
    subtitle: "女鬼線",
    desc: "你將成為被姥姥控制的女鬼，在蘭若寺中掙扎求生。白日不可見光，夜晚徘徊人間。你渴望自由，卻被骨灰束縛⋯⋯",
    icon: "幽",
    gradient: "from-ghost-white/10 to-ghost-white/5",
    borderHover: "hover:border-ghost-white/40",
    accent: "text-ghost-white",
    accentDim: "text-ghost-white/70",
    glow: "hover:shadow-[0_0_30px_rgba(180,210,255,0.1)]",
  },
  {
    id: "寧采臣" as const,
    name: "寧 采 臣",
    subtitle: "書生線",
    desc: "你將成為赴京趕考的窮書生，借宿蘭若寺。手無寸鐵，唯有一顆赤誠之心。命運的齒輪，將在月夜轉動⋯⋯",
    icon: "書",
    gradient: "from-jade/10 to-jade/5",
    borderHover: "hover:border-jade/40",
    accent: "text-jade",
    accentDim: "text-jade/50",
    glow: "hover:shadow-[0_0_30px_rgba(45,106,79,0.15)]",
  },
];

export default function CharacterSelect({ playerId, slotNumber }: { playerId?: string; slotNumber?: number }) {
  const { state, dispatch } = useGame();

  async function handleSelect(character: "聶小倩" | "寧采臣") {
    if (!state.game.player) return;
    dispatch({
      type: "SET_PLAYER",
      payload: { ...state.game.player, character },
    });

    // Create game session in Supabase
    if (playerId) {
      try {
        const res = await authFetch("/api/game", {
          method: "POST",
          body: JSON.stringify({
            slotNumber: slotNumber || 1,
            characterName: state.game.player.characterName,
            playerAge: state.game.player.age,
            playerGender: state.game.player.gender,
            playerOccupation: state.game.player.occupation,
            chosenCharacter: character,
          }),
        });
        const data = await res.json();
        if (data.session) {
          dispatch({ type: "SET_SESSION_ID", payload: data.session.id });
        }
      } catch {
        // Continue even if save fails
      }
    }

    dispatch({ type: "SET_PHASE", payload: "death" });
  }

  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="max-w-2xl w-full animate-fade-in-up px-4 pt-[5vh] sm:pt-[8vh] pb-8">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-3">
            選 擇 命 運
          </h1>
          <div className="ancient-divider mx-auto max-w-[200px]">❖</div>
          <p className="text-ghost-white/70 text-sm mt-3">
            {state.game.player?.age}歲的{state.game.player?.occupation}，
            {state.game.player?.gender === "female" ? "她" : "他"}的靈魂即將墜入輪迴⋯⋯
          </p>
        </div>

        {/* Character Cards */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          {CHARACTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleSelect(ch.id)}
              className={`group text-left glass-panel ancient-frame rounded-2xl p-6 sm:p-7
                bg-gradient-to-br ${ch.gradient}
                border border-gold/10 ${ch.borderHover}
                ${ch.glow}
                transition-all duration-500 hover:scale-[1.02]`}
            >
              {/* Icon */}
              <div className={`w-16 h-16 rounded-full border border-gold/20 flex items-center justify-center text-2xl font-bold ${ch.accent} mb-5 group-hover:animate-ghost-float transition-all group-hover:border-gold/40`}>
                {ch.icon}
              </div>

              <h2 className={`text-xl font-bold ${ch.accent} mb-1 tracking-widest`}>
                {ch.name}
              </h2>
              <p className="text-[11px] text-gold/80 mb-4 tracking-wider">
                ── {ch.subtitle} ──
              </p>
              <p className="text-sm text-ghost-white/70 leading-relaxed">
                {ch.desc}
              </p>

              {/* Hint */}
              <div className={`mt-5 pt-4 border-t border-gold/10 text-xs ${ch.accentDim} group-hover:${ch.accent} transition-colors tracking-wider`}>
                點擊選擇 →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
