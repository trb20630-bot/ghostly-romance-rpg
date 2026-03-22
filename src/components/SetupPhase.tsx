"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";

const OCCUPATIONS = [
  "會計師", "記者", "護理師", "工程師",
  "老師", "業務", "設計師", "律師",
  "廚師", "警察",
];

export default function SetupPhase() {
  const { dispatch } = useGame();
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [occupation, setOccupation] = useState("");
  const [customOccupation, setCustomOccupation] = useState("");

  const finalOccupation = occupation === "__custom" ? customOccupation : occupation;

  function handleNext() {
    if (!finalOccupation.trim()) return;
    dispatch({
      type: "SET_PLAYER",
      payload: { age, gender, occupation: finalOccupation, character: "寧采臣" },
    });
    dispatch({ type: "SET_PHASE", payload: "character" });
  }

  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-lg animate-fade-in-up px-4 pt-[5vh] sm:pt-[8vh] pb-8">
        {/* Title Card */}
        <div className="text-center mb-6">
          <div className="inline-block mb-3">
            <span className="text-4xl sm:text-5xl animate-ghost-float inline-block">🕯️</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-3">
            輪 迴 之 門
          </h1>
          <div className="ancient-divider mx-auto max-w-[200px]">❖</div>
          <p className="text-ghost-white/50 text-sm mt-3 tracking-wide">
            在踏入輪迴之前⋯⋯請告訴我，你是誰？
          </p>
        </div>

        {/* Form Panel */}
        <div className="glass-panel ancient-frame corner-decor rounded-2xl p-5 sm:p-7 space-y-5">

          {/* Age */}
          <div>
            <label className="block text-xs text-gold/70 mb-3 tracking-widest uppercase">
              生 前 年 歲
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={18}
                max={70}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="flex-1 accent-gold h-1 cursor-pointer"
              />
              <span className="text-gold font-bold text-xl w-10 text-right tabular-nums">
                {age}
              </span>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-xs text-gold/70 mb-3 tracking-widest uppercase">
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
                        : "border border-ghost-white/10 text-ghost-white/40 hover:border-gold/30 hover:text-gold/60"
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
            <label className="block text-xs text-gold/70 mb-3 tracking-widest uppercase">
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
                      : "border border-ghost-white/10 text-ghost-white/40 hover:border-gold/30 hover:text-gold/60"
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
                    : "border border-ghost-white/10 text-ghost-white/40 hover:border-lantern/30 hover:text-lantern/60"
                }`}
              >
                ✦ 自訂職業
              </button>
            </div>
            {occupation === "__custom" && (
              <input
                type="text"
                value={customOccupation}
                onChange={(e) => setCustomOccupation(e.target.value)}
                placeholder="輸入你的職業⋯"
                className="mt-3 w-full input-ancient rounded-lg px-4 py-2.5 text-sm text-ghost-white"
                autoFocus
              />
            )}
          </div>

          {/* Divider */}
          <div className="ancient-divider">✦</div>

          {/* Submit */}
          <button
            onClick={handleNext}
            disabled={!finalOccupation.trim()}
            className="w-full py-3.5 rounded-xl text-lg tracking-widest transition-all disabled:opacity-20 disabled:cursor-not-allowed btn-jade font-bold"
          >
            確 認 身 份
          </button>
        </div>
      </div>
    </div>
  );
}
