"use client";

import { useState, useEffect } from "react";

interface Props {
  onLogin: (result: {
    player: { id: string; display_name: string };
    session: Record<string, unknown> | null;
    memory: Record<string, unknown> | null;
    conversations: Array<{ round_number: number; role: string; content: string; phase: string }>;
  }) => void;
}

export default function AuthScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [names, setNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [regName, setRegName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Load player list
  useEffect(() => {
    loadNames();
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
      setMessage({ text: `歡迎回來，${data.player.display_name}！`, error: false });
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
        body: JSON.stringify({ action: "register", name: regName.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ text: "註冊成功！請切換到登入頁面進入遊戲。", error: false });
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
            <span className="text-4xl sm:text-5xl animate-ghost-float inline-block">🏮</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gold tracking-widest mb-2">
            倩 女 幽 魂
          </h1>
          <p className="text-ghost-white/40 text-xs tracking-wider">
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
                  : "text-ghost-white/30 hover:text-ghost-white/50"
              }`}
            >
              登 入
            </button>
            <button
              onClick={() => { setTab("register"); setMessage(null); }}
              className={`flex-1 pb-3 text-sm tracking-widest transition-all ${
                tab === "register"
                  ? "text-gold border-b-2 border-gold"
                  : "text-ghost-white/30 hover:text-ghost-white/50"
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
                <label className="block text-xs text-gold/70 mb-2 tracking-widest">
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
                <label className="block text-xs text-gold/70 mb-2 tracking-widest">
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
                <label className="block text-xs text-gold/70 mb-2 tracking-widest">
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
                <label className="block text-xs text-gold/70 mb-2 tracking-widest">
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
                <label className="block text-xs text-gold/70 mb-2 tracking-widest">
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
      </div>
    </div>
  );
}
