"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";
import GameIcon from "./GameIcon";

const OCCUPATIONS = [
  "會計師", "記者", "護理師", "工程師",
  "老師", "業務", "設計師", "律師",
  "廚師", "警察",
];

export default function SetupPhase({ playerId, slotNumber, onBack }: { playerId?: string; slotNumber?: number; onBack?: () => void }) {
  const { dispatch } = useGame();
  const [characterName, setCharacterName] = useState("");
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [occupation, setOccupation] = useState("");
  const [customOccupation, setCustomOccupation] = useState("");

  const finalOccupation = occupation === "__custom" ? customOccupation : occupation;

  function handleNext() {
    if (!characterName.trim() || !finalOccupation.trim()) return;
    dispatch({
      type: "SET_PLAYER",
      payload: { id: playerId, characterName: characterName.trim(), age, gender, occupation: finalOccupation, character: "寧采臣" },
    });
    dispatch({ type: "SET_PHASE", payload: "character" });
  }

  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-lg animate-fade-in-up px-4 pt-[5vh] sm:pt-[8vh] pb-8">
        {/* Title Card */}
        <div className="text-center mb-6">
          <div className="inline-block mb-3">
            <span className="animate-ghost-float inline-block"><GameIcon name="candle" size={72} /></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-3">
            輪 迴 之 門
          </h1>
          <div className="ancient-divider mx-auto max-w-[200px]">❖</div>
          <p className="text-ghost-white/70 text-sm mt-3 tracking-wide">
            在踏入輪迴之前⋯⋯請告訴我，你是誰？
          </p>
        </div>

        {/* Form Panel */}
        <div className="glass-panel ancient-frame corner-decor rounded-2xl p-5 sm:p-7 space-y-5">

          {/* Character Name */}
          <div>
            <label className="block text-xs text-gold/90 mb-3 tracking-widest uppercase">
              你 的 名 字
            </label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="為你的角色取一個名字⋯"
              maxLength={20}
              className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px] text-ghost-white"
              autoFocus
            />
            <p className="text-[10px] text-ghost-white/30 mt-1">這個名字將用於遊戲中和匯出的故事</p>
          </div>

          {/* Age */}
          <div>
            <label className="block text-xs text-gold/90 mb-3 tracking-widest uppercase">
              生 前 年 歲
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={18}
                max={70}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                onInput={(e) => setAge(Number((e.target as HTMLInputElement).value))}
                className="flex-1 h-6"
              />
              <span className="text-gold font-bold text-xl w-10 text-right tabular-nums">
                {age}
              </span>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs text-gold/90 mb-3 tracking-widest uppercase">
              性 別
            </label>
            <div className="flex gap-3">
              {([["male", "男"], ["female", "女"], ["other", "其他"]] as const).map(
                ([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setGender(val)}
                    className={`flex-1 py-2.5 rounded-lg text-sm tracking-wider transition-all ${
                      gender === val
                        ? "btn-ancient animate-pulse-glow"
                        : "border border-ghost-white/10 text-ghost-white/60 hover:border-gold/30 hover:text-gold/60"
                    }`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Occupation */}
          <div>
            <label className="block text-xs text-gold/90 mb-3 tracking-widest uppercase">
              前 世 職 業
            </label>
            <div className="grid grid-cols-2 gap-2">
              {OCCUPATIONS.map((occ) => (
                <button
                  key={occ}
                  onClick={() => setOccupation(occ)}
                  className={`py-2.5 px-3 rounded-lg text-sm transition-all ${
                    occupation === occ
                      ? "btn-ancient"
                      : "border border-ghost-white/10 text-ghost-white/60 hover:border-gold/30 hover:text-gold/60"
                  }`}
                >
                  {occ}
                </button>
              ))}
              <button
                onClick={() => setOccupation("__custom")}
                className={`py-2.5 px-3 rounded-lg text-sm transition-all col-span-2 ${
                  occupation === "__custom"
                    ? "btn-ancient"
                    : "border border-ghost-white/10 text-ghost-white/60 hover:border-lantern/30 hover:text-lantern/60"
                }`}
              >
                ✦ 自訂職業
              </button>
            </div>
            {occupation === "__custom" && (
              <div className="mt-3">
                <textarea
                  value={customOccupation}
                  onChange={(e) => {
                    if (e.target.value.length <= 5000) setCustomOccupation(e.target.value);
                  }}
                  placeholder={"任意描述你的前世身份，越詳細越好！\n\n例如：精通命理與風水的退役特種部隊指揮官⋯⋯"}
                  className="w-full input-ancient rounded-lg px-4 py-3 text-sm text-ghost-white resize-y leading-relaxed"
                  style={{ minHeight: "200px" }}
                />
                <p className="text-[10px] text-ghost-white/30 text-right mt-1.5 tabular-nums">
                  {customOccupation.length} / 5000 字
                </p>
              </div>
            )}
          </div>

          <div className="ancient-divider">✦</div>

          <button
            onClick={handleNext}
            disabled={!characterName.trim() || !finalOccupation.trim()}
            className="w-full py-3.5 rounded-xl text-lg tracking-widest transition-all disabled:opacity-20 disabled:cursor-not-allowed btn-jade font-bold"
          >
            確 認 身 份
          </button>

          {onBack && (
            <button
              onClick={onBack}
              className="w-full text-center text-xs text-ghost-white/30 hover:text-ghost-white/60 transition-colors tracking-wider mt-3"
            >
              ← 返回角色列表
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
