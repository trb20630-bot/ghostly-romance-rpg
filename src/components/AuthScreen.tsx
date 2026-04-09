"use client";

import { useState, useEffect } from "react";
import GameIcon from "./GameIcon";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onLogin: (result: any) => void;
}

export default function AuthScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [names, setNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [regName, setRegName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Load player list + check for referral code in localStorage
  useEffect(() => {
    loadNames();
    const savedCode = localStorage.getItem("referralCode");
    if (savedCode) {
      setReferralCode(savedCode.toUpperCase());
      setTab("register");
    }
  }, []);

  async function loadNames() {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      if (data.names) setNames(data.names);
    } catch {
      // Silent fail
    }
  }

  async function handleLogin() {
    if (!selectedName || !password) {
      setMessage({ text: "請選擇名號並輸入密碼", error: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", name: selectedName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ text: `歡迎回來，${data.player.name}！`, error: false });
      setTimeout(() => onLogin(data), 600);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "登入失敗", error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!regName.trim()) {
      setMessage({ text: "請輸入名號", error: true });
      return;
    }
    if (!password) {
      setMessage({ text: "請輸入密碼", error: true });
      return;
    }
    if (password !== password2) {
      setMessage({ text: "兩次密碼不一致", error: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", name: regName.trim(), password, referralCode: referralCode.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // 清除 localStorage 中的邀請碼
      localStorage.removeItem("referralCode");
      const bonusMsg = data.referralBonus ? "（已獲得 5 墨幣新手禮！）" : "";
      setMessage({ text: `註冊成功！請切換到登入頁面進入遊戲。${bonusMsg}`, error: false });
      setTab("login");
      setPassword("");
      setPassword2("");
      await loadNames();
      setSelectedName(regName.trim());
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "註冊失敗", error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-[100dvh] flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-md animate-fade-in-up px-4 pt-[8vh] sm:pt-[12vh] pb-8">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3">
            <span className="animate-ghost-float inline-block"><GameIcon name="lantern" size={72} /></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">
            倩 女 幽 魂
          </h1>
          <p className="text-ghost-white/60 text-xs tracking-wider">
            那些關於我轉生成為聶小倩／寧采臣的那件事
          </p>
        </div>

        {/* Panel */}
        <div className="glass-panel ancient-frame corner-decor rounded-2xl p-5 sm:p-7">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-gold/15">
            <button
              onClick={() => { setTab("login"); setMessage(null); }}
              className={`flex-1 pb-3 text-sm tracking-widest transition-all ${
                tab === "login"
                  ? "text-gold border-b-2 border-gold"
                  : "text-ghost-white/50 hover:text-ghost-white/50"
              }`}
            >
              登 入
            </button>
            <button
              onClick={() => { setTab("register"); setMessage(null); }}
              className={`flex-1 pb-3 text-sm tracking-widest transition-all ${
                tab === "register"
                  ? "text-gold border-b-2 border-gold"
                  : "text-ghost-white/50 hover:text-ghost-white/50"
              }`}
            >
              註 冊
            </button>
          </div>

          {/* Message */}
          {message && (
            <div className={`text-sm text-center px-4 py-2.5 rounded-lg mb-4 ${
              message.error
                ? "text-blood-red bg-blood-red/10 border border-blood-red/20"
                : "text-jade bg-jade/10 border border-jade/20"
            }`}>
              {message.text}
            </div>
          )}

          {/* Login Form */}
          {tab === "login" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  名 號
                </label>
                <select
                  value={selectedName}
                  onChange={(e) => setSelectedName(e.target.value)}
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px] appearance-none cursor-pointer"
                >
                  <option value="">選擇你的名號⋯</option>
                  {names.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  密 碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="輸入密碼⋯"
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px]"
                />
              </div>
              <div className="ancient-divider">✦</div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full btn-jade rounded-xl py-3 text-base tracking-widest font-bold disabled:opacity-40"
              >
                {loading ? "進入中⋯⋯" : "進 入 遊 戲"}
              </button>
            </div>
          )}

          {/* Register Form */}
          {tab === "register" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  名 號
                </label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="取一個名號⋯"
                  maxLength={10}
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  密 碼
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="設定密碼⋯"
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  確 認 密 碼
                </label>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  placeholder="再輸入一次密碼⋯"
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block text-xs text-gold/90 mb-2 tracking-widest">
                  邀 請 碼 <span className="text-ghost-white/30">（選填）</span>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="輸入好友的邀請碼⋯"
                  maxLength={6}
                  className="w-full input-ancient rounded-lg px-4 py-2.5 text-[15px] font-mono tracking-widest"
                />
                {referralCode && (
                  <p className="text-[10px] text-[#C4A77D]/60 mt-1">註冊後雙方都能獲得墨幣獎勵</p>
                )}
              </div>
              <div className="ancient-divider">✦</div>
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full btn-ancient rounded-xl py-3 text-base tracking-widest font-bold disabled:opacity-40"
              >
                {loading ? "建立中⋯⋯" : "建 立 帳 號"}
              </button>
            </div>
          )}
        </div>

        {/* LINE Login */}
        <div className="mt-5">
          <a
            href="/api/auth/line/login"
            className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-base tracking-widest font-bold text-white transition-all hover:brightness-110"
            style={{ backgroundColor: "#06C755" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            使用 LINE 登入
          </a>
        </div>

        {/* Gallery button */}
        <div className="mt-3">
          <a
            href="/gallery"
            className="block w-full btn-ancient rounded-xl py-3 text-base tracking-widest font-bold text-center"
          >
            作 品 牆
          </a>
        </div>

        {/* Admin link */}
        <div className="text-center mt-3">
          <a href="/admin/tokens" className="text-[11px] text-ghost-white/20 hover:text-ghost-white/40 transition-colors">管理後台</a>
        </div>
      </div>
    </div>
  );
}
