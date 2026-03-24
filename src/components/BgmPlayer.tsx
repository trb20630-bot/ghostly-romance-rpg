"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { SCENE_BGM } from "@/lib/scene-bgm";

// 遊戲階段 fallback（場景標記未出現時使用）
const PHASE_BGM: Record<string, string> = {
  login: "/audio/月影书声.mp3",
  setup: "/audio/月影书声.mp3",
  character: "/audio/月影书声.mp3",
  death: "/audio/Midnight In The Boardroom.mp3",
  reincarnation: "/audio/Ethereal Ascent.mp3",
  story: "/audio/幽寺阴风.mp3",
  ending: "/audio/余音不散.mp3",
  export: "/audio/余音不散.mp3",
};

const ALL_TRACKS = [
  { id: "月影书声", label: "月影書聲", file: "/audio/月影书声.mp3" },
  { id: "Midnight", label: "現代篇", file: "/audio/Midnight In The Boardroom.mp3" },
  { id: "Ethereal", label: "輪迴", file: "/audio/Ethereal Ascent.mp3" },
  { id: "幽寺", label: "蘭若寺", file: "/audio/幽寺阴风.mp3" },
  { id: "月影幽恋", label: "浪漫", file: "/audio/月影幽恋.mp3" },
  { id: "冥锋对决", label: "戰鬥", file: "/audio/冥锋对决.mp3" },
  { id: "余音不散", label: "結局", file: "/audio/余音不散.mp3" },
];

const FADE_DURATION = 1000; // 1 秒淡入淡出

interface Props {
  phase?: string;
  location?: string;
  sceneTag?: string | null;
  showSelector?: boolean;
  ducking?: boolean; // true = TTS 正在播放，BGM 降到 20%
}

export default function BgmPlayer({ phase = "login", sceneTag, showSelector, ducking = false }: Props) {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bgm_enabled") !== "false";
  });
  const [volume, setVolumeRaw] = useState(() => {
    if (typeof window === "undefined") return 0.8;
    const saved = localStorage.getItem("bgm_volume");
    const val = saved !== null ? Number(saved) : 0.8;
    console.log("[音量控制] 載入儲存音量:", val);
    return val;
  });

  // 包裝 setVolume，加入日誌
  const setVolume = useCallback((v: number) => {
    console.log("[音量控制] 調整音量:", v);
    setVolumeRaw(v);
  }, []);
  const [showControls, setShowControls] = useState(false);
  const [manualTrack, setManualTrack] = useState<string | null>(null);
  const [needsInteraction, setNeedsInteraction] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSrcRef = useRef("");
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetVolumeRef = useRef(volume);

  // 更新目標音量 ref
  useEffect(() => { targetVolumeRef.current = volume; }, [volume]);

  // 決定播放哪首：手動 > 場景標記 > 階段 fallback
  const targetSrc = manualTrack
    || (sceneTag && SCENE_BGM[sceneTag])
    || PHASE_BGM[phase]
    || PHASE_BGM.login;

  // 淡出音訊
  const fadeOut = useCallback((audio: HTMLAudioElement): Promise<void> => {
    return new Promise((resolve) => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      const startVol = audio.volume;
      const steps = 20;
      const stepTime = FADE_DURATION / steps;
      let step = 0;
      fadeTimerRef.current = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol * (1 - step / steps));
        if (step >= steps) {
          if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
          audio.pause();
          resolve();
        }
      }, stepTime);
    });
  }, []);

  // 淡入音訊
  const fadeIn = useCallback((audio: HTMLAudioElement, targetVol: number) => {
    if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
    audio.volume = 0;
    const steps = 20;
    const stepTime = FADE_DURATION / steps;
    let step = 0;
    fadeTimerRef.current = setInterval(() => {
      step++;
      audio.volume = Math.min(targetVol, targetVol * (step / steps));
      if (step >= steps) {
        if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    }, stepTime);
  }, []);

  // 嘗試播放
  const tryPlay = useCallback((audio: HTMLAudioElement) => {
    if (!enabled) return;
    const promise = audio.play();
    if (promise) {
      promise.then(() => setNeedsInteraction(false)).catch(() => setNeedsInteraction(true));
    }
  }, [enabled]);

  // 切換曲目（含淡入淡出）
  const switchTrack = useCallback(async (newSrc: string) => {
    // 同曲不重複切換
    if (currentSrcRef.current === newSrc && audioRef.current && !audioRef.current.paused) return;

    // 淡出舊音樂
    if (audioRef.current && !audioRef.current.paused) {
      await fadeOut(audioRef.current);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // 載入新音樂
    const audio = new Audio(newSrc);
    audio.loop = true;
    audio.volume = 0;
    audio.onerror = () => console.error("BGM load error:", newSrc);
    audioRef.current = audio;
    currentSrcRef.current = newSrc;

    if (enabled) {
      tryPlay(audio);
      // 淡入
      fadeIn(audio, targetVolumeRef.current);
    }
  }, [enabled, fadeOut, fadeIn, tryPlay]);

  // 響應目標音源變化
  useEffect(() => {
    switchTrack(targetSrc);
  }, [targetSrc, switchTrack]);

  // 瀏覽器自動播放限制解鎖
  useEffect(() => {
    if (!needsInteraction) return;
    function unlock() {
      if (audioRef.current && enabled) {
        audioRef.current.play().then(() => setNeedsInteraction(false)).catch(() => {});
      }
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    }
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    document.addEventListener("touchstart", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, [needsInteraction, enabled]);

  // 開關音樂
  useEffect(() => {
    localStorage.setItem("bgm_enabled", String(enabled));
    if (audioRef.current) {
      if (enabled) {
        tryPlay(audioRef.current);
        fadeIn(audioRef.current, volume);
      } else {
        fadeOut(audioRef.current);
      }
    }
  }, [enabled, tryPlay, fadeIn, fadeOut, volume]);

  // 音量變化 — 如果沒有淡入淡出正在進行，立即套用
  useEffect(() => {
    localStorage.setItem("bgm_volume", String(volume));
    // 如果正在淡入淡出，不要中斷（淡入淡出完成後會套用目標音量）
    if (fadeTimerRef.current) {
      console.log("[音量控制] 淡入淡出進行中，音量已儲存，待完成後套用");
      return;
    }
    if (audioRef.current) {
      audioRef.current.volume = ducking ? volume * 0.2 : volume;
      console.log("[音量控制] 已套用 audio.volume =", audioRef.current.volume);
    }
  }, [volume, ducking]);

  // TTS ducking：語音播放時 BGM 降到 20%
  useEffect(() => {
    if (!audioRef.current) return;
    const target = ducking ? volume * 0.2 : volume;
    audioRef.current.volume = target;
  }, [ducking, volume]);

  // 開發用測試函數
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as Record<string, unknown>).testVolume = (vol: number) => {
      if (!audioRef.current) {
        console.error("[音量控制] audioRef 不存在，無法測試");
        return;
      }
      const clamped = Math.max(0, Math.min(1, vol));
      audioRef.current.volume = clamped;
      setVolumeRaw(clamped);
      console.log("[音量控制] testVolume 已設定:", clamped);
    };
    (window as unknown as Record<string, unknown>).debugBgm = () => ({
      audioExists: !!audioRef.current,
      paused: audioRef.current?.paused,
      currentVolume: audioRef.current?.volume,
      stateVolume: volume,
      savedVolume: localStorage.getItem("bgm_volume"),
      currentSrc: currentSrcRef.current,
      enabled,
    });
    return () => {
      delete (window as unknown as Record<string, unknown>).testVolume;
      delete (window as unknown as Record<string, unknown>).debugBgm;
    };
  }, [volume, enabled]);

  // 清理
  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-1">
      <button
        onClick={() => {
          setEnabled(!enabled);
          if (!enabled && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }}
        className="w-8 h-8 rounded-full glass-panel flex items-center justify-center text-sm hover:border-gold/40 transition-all"
        title={enabled ? "靜音" : "開啟音樂"}
      >
        {enabled ? "🔊" : "🔇"}
      </button>

      <button
        onClick={() => setShowControls(!showControls)}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-ghost-white/30 hover:text-ghost-white/60 transition-colors"
      >
        {showControls ? "✕" : "♫"}
      </button>

      {showControls && (
        <div className="absolute top-10 right-0 glass-panel rounded-xl p-3 w-[calc(100vw-2rem)] sm:w-52 max-w-[13rem] space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ghost-white/40 w-6">音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))}
              className="flex-1 h-6"
            />
            <span className="text-[10px] text-ghost-white/40 tabular-nums w-8">{Math.round(volume * 100)}%</span>
          </div>

          {showSelector && (
            <div className="space-y-1">
              <span className="text-[10px] text-ghost-white/40">選擇曲目</span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setManualTrack(null)}
                  className={`text-[10px] px-2 py-1 rounded transition-all ${!manualTrack ? "btn-ancient" : "border border-ghost-white/10 text-ghost-white/40 hover:border-gold/20"}`}
                >
                  自動
                </button>
                {ALL_TRACKS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setManualTrack(t.file)}
                    className={`text-[10px] px-2 py-1 rounded transition-all ${manualTrack === t.file ? "btn-ancient" : "border border-ghost-white/10 text-ghost-white/40 hover:border-gold/20"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
