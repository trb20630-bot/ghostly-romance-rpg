"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";

interface SurveyModalProps {
  sessionId: string | null;
  playerId?: string;
  onClose: () => void;
}

const MATRIX_ITEMS = [
  { key: "storyRating", label: "劇情有趣程度" },
  { key: "aiQualityRating", label: "AI 回應的品質" },
  { key: "optionCoherenceRating", label: "選項與劇情的連貫性" },
  { key: "characterRating", label: "角色塑造的魅力" },
  { key: "pacingRating", label: "遊玩節奏" },
] as const;

const GENRE_GROUPS = [
  {
    label: "古風類",
    items: ["武俠江湖", "宮廷權謀", "仙俠修真", "古風言情"],
  },
  {
    label: "現代/都市類",
    items: ["現代懸疑推理", "都市愛情", "娛樂圈", "豪門恩怨"],
  },
  {
    label: "奇幻/異世界類",
    items: ["西方奇幻", "末日生存", "科幻未來", "克蘇魯/靈異恐怖"],
  },
  {
    label: "輕鬆向",
    items: ["種田經營", "美食料理", "萌寵養成"],
  },
  {
    label: "特殊玩法",
    items: ["無限流", "快穿", "重生/穿書"],
  },
];

const LENGTH_OPTIONS = [
  "短篇（30回合內）",
  "中篇（30-60回合）",
  "長篇（60回合以上）",
  "都可以",
];

export default function SurveyModal({ sessionId, playerId, onClose }: SurveyModalProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);

  // Q1
  const [overallRating, setOverallRating] = useState(0);
  // Q2
  const [matrixRatings, setMatrixRatings] = useState<Record<string, number>>({});
  // Q3
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  // Q4
  const [preferredLength, setPreferredLength] = useState("");
  // Q5
  const [suggestions, setSuggestions] = useState("");

  const canNext = () => {
    switch (step) {
      case 1: return overallRating > 0;
      case 2: return MATRIX_ITEMS.every((item) => matrixRatings[item.key] > 0);
      case 3: return selectedGenres.length >= 1 && selectedGenres.length <= 3;
      case 4: return preferredLength !== "";
      case 5: return true;
      default: return false;
    }
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= 3) return prev;
      return [...prev, genre];
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await authFetch("/api/survey", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          playerId,
          overallRating,
          storyRating: matrixRatings.storyRating,
          aiQualityRating: matrixRatings.aiQualityRating,
          optionCoherenceRating: matrixRatings.optionCoherenceRating,
          characterRating: matrixRatings.characterRating,
          pacingRating: matrixRatings.pacingRating,
          preferredGenres: selectedGenres,
          preferredLength,
          suggestions: suggestions.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      setResult("success");
    } catch {
      setResult("error");
    } finally {
      setSubmitting(false);
    }
  };

  // Stars component
  const Stars = ({ value, onChange, size = "text-2xl" }: { value: number; onChange: (v: number) => void; size?: string }) => (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`${size} transition-all hover:scale-110 ${star <= value ? "text-[#C4A77D]" : "text-ghost-white/20"}`}
        >
          {star <= value ? "\u2605" : "\u2606"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-night/85 backdrop-blur-sm">
      <div className="glass-panel ancient-frame corner-decor rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col animate-fade-in-up">
        {/* Header */}
        <div className="shrink-0 p-5 pb-3 sm:px-7 sm:pt-7">
          <h2 className="text-lg text-[#C4A77D] font-bold tracking-widest text-center">
            {result === "success" ? "感謝回饋" : "遊戲體驗問卷"}
          </h2>
          <div className="ancient-divider mx-auto max-w-[120px] mt-2">&#10054;</div>
          {!result && (
            <div className="flex justify-center gap-1.5 mt-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${
                    s === step ? "w-6 bg-[#C4A77D]" : s < step ? "w-4 bg-[#C4A77D]/50" : "w-4 bg-ghost-white/15"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7 space-y-4 scrollbar-ink">
          {result === "success" ? (
            <div className="text-center space-y-4 py-6">
              <div className="text-4xl">&#127873;</div>
              <p className="text-[#C4A77D] text-sm font-bold">感謝您的回饋！已獲得 10 墨幣獎勵</p>
              <p className="text-ghost-white/40 text-xs">您的意見將幫助我們打造更好的遊戲體驗</p>
              <button
                onClick={onClose}
                className="btn-jade rounded-lg px-6 py-2.5 text-sm tracking-wider font-bold mt-2"
              >
                繼續冒險
              </button>
            </div>
          ) : result === "error" ? (
            <div className="text-center space-y-4 py-6">
              <p className="text-blood-red text-sm">提交失敗，請稍後再試</p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setResult(null)} className="btn-jade rounded-lg px-4 py-2 text-xs tracking-wider">重試</button>
                <button onClick={onClose} className="btn-ancient rounded-lg px-4 py-2 text-xs tracking-wider">稍後再說</button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Overall Rating */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-ghost-white/70 text-center">
                    <span className="text-[#C4A77D]">Q1.</span> 整體滿意度
                  </p>
                  <Stars value={overallRating} onChange={setOverallRating} size="text-3xl" />
                  <p className="text-xs text-ghost-white/30 text-center">
                    {overallRating === 0 ? "點選星星評分" : ["", "待改進", "尚可", "不錯", "很好", "非常滿意"][overallRating]}
                  </p>
                </div>
              )}

              {/* Step 2: Matrix Ratings */}
              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-ghost-white/70 text-center mb-3">
                    <span className="text-[#C4A77D]">Q2.</span> 遊戲體驗細項
                  </p>
                  {MATRIX_ITEMS.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-ghost-white/60 shrink-0 w-[7rem]">{item.label}</span>
                      <Stars value={matrixRatings[item.key] || 0} onChange={(v) => setMatrixRatings((prev) => ({ ...prev, [item.key]: v }))} size="text-lg" />
                    </div>
                  ))}
                </div>
              )}

              {/* Step 3: Preferred Genres */}
              {step === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-ghost-white/70 text-center">
                    <span className="text-[#C4A77D]">Q3.</span> 未來想玩的題材
                  </p>
                  <p className="text-[10px] text-ghost-white/30 text-center">最多選 3 個（已選 {selectedGenres.length}/3）</p>
                  {GENRE_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-[10px] text-[#C4A77D]/60 tracking-widest mb-1.5">{group.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((genre) => {
                          const selected = selectedGenres.includes(genre);
                          const disabled = !selected && selectedGenres.length >= 3;
                          return (
                            <button
                              key={genre}
                              type="button"
                              onClick={() => toggleGenre(genre)}
                              disabled={disabled}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                                selected
                                  ? "border-[#C4A77D] bg-[#C4A77D]/20 text-[#C4A77D]"
                                  : disabled
                                  ? "border-ghost-white/5 text-ghost-white/15 cursor-not-allowed"
                                  : "border-ghost-white/15 text-ghost-white/50 hover:border-ghost-white/30"
                              }`}
                            >
                              {genre}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 4: Preferred Length */}
              {step === 4 && (
                <div className="space-y-3">
                  <p className="text-sm text-ghost-white/70 text-center">
                    <span className="text-[#C4A77D]">Q4.</span> 遊戲時長偏好
                  </p>
                  <div className="space-y-2">
                    {LENGTH_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPreferredLength(option)}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm text-left border transition-all ${
                          preferredLength === option
                            ? "border-[#C4A77D] bg-[#C4A77D]/15 text-[#C4A77D]"
                            : "border-ghost-white/10 text-ghost-white/50 hover:border-ghost-white/25"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5: Suggestions */}
              {step === 5 && (
                <div className="space-y-3">
                  <p className="text-sm text-ghost-white/70 text-center">
                    <span className="text-[#C4A77D]">Q5.</span> 其他建議
                    <span className="text-ghost-white/30 text-xs ml-1">（選填）</span>
                  </p>
                  <textarea
                    value={suggestions}
                    onChange={(e) => setSuggestions(e.target.value.slice(0, 200))}
                    placeholder="任何想法或建議都歡迎..."
                    rows={4}
                    className="w-full input-ancient rounded-lg px-4 py-2.5 text-sm text-ghost-white resize-none"
                  />
                  <p className="text-[10px] text-ghost-white/25 text-right">{suggestions.length}/200</p>
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-2">
                {step > 1 && (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className="btn-ancient rounded-lg px-4 py-2.5 text-sm tracking-wider"
                  >
                    上一步
                  </button>
                )}
                {step === 1 && (
                  <button
                    onClick={onClose}
                    className="btn-ancient rounded-lg px-4 py-2.5 text-sm tracking-wider"
                  >
                    稍後再說
                  </button>
                )}
                {step < 5 ? (
                  <button
                    onClick={() => setStep((s) => s + 1)}
                    disabled={!canNext()}
                    className="flex-1 btn-jade rounded-lg py-2.5 text-sm tracking-wider font-bold disabled:opacity-30"
                  >
                    下一步（{step}/5）
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 btn-jade rounded-lg py-2.5 text-sm tracking-wider font-bold disabled:opacity-30"
                  >
                    {submitting ? "提交中..." : "提交問卷"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
