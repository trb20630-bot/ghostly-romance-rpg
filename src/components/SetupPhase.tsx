"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";

const OCCUPATIONS = [
  "會計師",
  "記者",
  "護理師",
  "工程師",
  "老師",
  "業務",
  "設計師",
  "律師",
  "廚師",
  "警察",
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
      payload: {
        age,
        gender,
        occupation: finalOccupation,
        character: "寧采臣", // placeholder, will be set in next phase
      },
    });
    dispatch({ type: "SET_PHASE", payload: "character" });
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-md w-full animate-fade-in-up py-8">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-serif font-bold text-gold mb-2">
            輪迴之門
          </h1>
          <p className="text-ghost-white/60 text-sm">
            在踏入輪迴之前⋯⋯請告訴我，你是誰？
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6 bg-night-light/50 rounded-xl p-6 border border-jade/20">
          {/* Age */}
          <div>
            <label className="block text-sm text-ghost-white/70 mb-2 font-serif">
              年齡
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={18}
                max={70}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="flex-1 accent-jade"
              />
              <span className="text-gold font-bold w-8 text-right">{age}</span>
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm text-ghost-white/70 mb-2 font-serif">
              性別
            </label>
            <div className="flex gap-3">
              {([
                ["male", "男"],
                ["female", "女"],
                ["other", "其他"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setGender(val)}
                  className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                    gender === val
                      ? "border-jade bg-jade/20 text-jade"
                      : "border-ghost-white/20 text-ghost-white/50 hover:border-ghost-white/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Occupation */}
          <div>
            <label className="block text-sm text-ghost-white/70 mb-2 font-serif">
              職業
            </label>
            <div className="grid grid-cols-2 gap-2">
              {OCCUPATIONS.map((occ) => (
                <button
                  key={occ}
                  onClick={() => setOccupation(occ)}
                  className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                    occupation === occ
                      ? "border-jade bg-jade/20 text-jade"
                      : "border-ghost-white/20 text-ghost-white/50 hover:border-ghost-white/40"
                  }`}
                >
                  {occ}
                </button>
              ))}
              <button
                onClick={() => setOccupation("__custom")}
                className={`py-2 px-3 rounded-lg border text-sm transition-all col-span-2 ${
                  occupation === "__custom"
                    ? "border-lantern bg-lantern/20 text-lantern"
                    : "border-ghost-white/20 text-ghost-white/50 hover:border-ghost-white/40"
                }`}
              >
                自訂職業
              </button>
            </div>
            {occupation === "__custom" && (
              <input
                type="text"
                value={customOccupation}
                onChange={(e) => setCustomOccupation(e.target.value)}
                placeholder="輸入你的職業⋯"
                className="mt-2 w-full bg-night border border-ghost-white/20 rounded-lg px-4 py-2 text-sm text-ghost-white placeholder:text-ghost-white/30 focus:outline-none focus:border-jade"
              />
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleNext}
            disabled={!finalOccupation.trim()}
            className="w-full py-3 rounded-lg font-serif text-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-jade/80 hover:bg-jade text-white"
          >
            確認身份
          </button>
        </div>
      </div>
    </div>
  );
}
