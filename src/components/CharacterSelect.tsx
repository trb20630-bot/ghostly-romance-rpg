"use client";

import { useGame } from "./GameProvider";

const CHARACTERS = [
  {
    id: "聶小倩" as const,
    name: "聶小倩",
    subtitle: "女鬼線",
    desc: "你將成為被姥姥控制的女鬼，在蘭若寺中掙扎求生。白日不可見光，夜晚徘徊人間。你渴望自由，卻被骨灰束縛⋯⋯",
    color: "ghost-white",
    borderColor: "border-ghost-white/40",
    bgColor: "bg-ghost-white/5",
    hoverBg: "hover:bg-ghost-white/10",
    icon: "幽",
  },
  {
    id: "寧采臣" as const,
    name: "寧采臣",
    subtitle: "書生線",
    desc: "你將成為赴京趕考的窮書生，借宿蘭若寺。手無寸鐵，唯有一顆赤誠之心。命運的齒輪，將在月夜轉動⋯⋯",
    color: "jade",
    borderColor: "border-jade/40",
    bgColor: "bg-jade/5",
    hoverBg: "hover:bg-jade/10",
    icon: "書",
  },
];

export default function CharacterSelect() {
  const { state, dispatch } = useGame();

  function handleSelect(character: "聶小倩" | "寧采臣") {
    if (!state.game.player) return;
    dispatch({
      type: "SET_PLAYER",
      payload: { ...state.game.player, character },
    });
    dispatch({ type: "SET_PHASE", payload: "death" });
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full animate-fade-in-up py-8">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif font-bold text-gold mb-2">
            選擇你的命運
          </h1>
          <p className="text-ghost-white/60 text-sm">
            {state.game.player?.age}歲的{state.game.player?.occupation}
            ，{state.game.player?.gender === "female" ? "她" : "他"}
            的靈魂即將墜入輪迴⋯⋯
          </p>
          <p className="text-ghost-white/40 text-xs mt-1">
            你將轉生為誰？
          </p>
        </div>

        {/* Character Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {CHARACTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => handleSelect(ch.id)}
              className={`group text-left p-6 rounded-xl border ${ch.borderColor} ${ch.bgColor} ${ch.hoverBg} transition-all duration-300 hover:scale-[1.02]`}
            >
              {/* Icon */}
              <div
                className={`w-16 h-16 rounded-full border ${ch.borderColor} flex items-center justify-center text-2xl font-serif font-bold text-${ch.color} mb-4 group-hover:animate-ghost-float`}
              >
                {ch.icon}
              </div>

              <h2 className={`text-xl font-serif font-bold text-${ch.color} mb-1`}>
                {ch.name}
              </h2>
              <p className="text-xs text-gold/80 mb-3">{ch.subtitle}</p>
              <p className="text-sm text-ghost-white/60 leading-relaxed">
                {ch.desc}
              </p>

              {/* Arrow hint */}
              <div className={`mt-4 text-xs text-${ch.color}/50 group-hover:text-${ch.color} transition-colors`}>
                點擊選擇 →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
