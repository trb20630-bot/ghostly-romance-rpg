'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function PlatformLogin() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleLogin() {
    if (!name.trim() || !password) {
      setMessage({ text: '請輸入帳號和密碼', error: true });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.token) {
        sessionStorage.setItem('authToken', data.token);
        sessionStorage.setItem('playerId', data.player.id);
        sessionStorage.setItem('playerName', data.player.name);
      }
      setMessage({ text: `歡迎回來，${data.player.name}！`, error: false });
      setTimeout(() => router.push('/platform'), 600);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : '登入失敗', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!name.trim()) { setMessage({ text: '請輸入帳號', error: true }); return; }
    if (!password) { setMessage({ text: '請輸入密碼', error: true }); return; }
    if (password !== password2) { setMessage({ text: '兩次密碼不一致', error: true }); return; }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ text: '註冊成功！請登入', error: false });
      setTab('login');
      setPassword('');
      setPassword2('');
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : '註冊失敗', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative flex items-center justify-center"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-6 py-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/inkey-logo.png"
            alt="墨鍵物語 Inkey"
            className="h-auto w-auto mx-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] brightness-110 contrast-110 mb-4"
          />
          <p className="text-white/50 text-sm">AI 互動敘事平台</p>
        </div>

        {/* Card */}
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
          {/* Tabs */}
          <div className="flex mb-6 border-b border-white/10">
            <button
              onClick={() => { setTab('login'); setMessage(null); }}
              className={`flex-1 pb-3 text-sm font-medium transition-all ${
                tab === 'login'
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              登入
            </button>
            <button
              onClick={() => { setTab('register'); setMessage(null); }}
              className={`flex-1 pb-3 text-sm font-medium transition-all ${
                tab === 'register'
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              註冊
            </button>
          </div>

          {/* Message */}
          {message && (
            <div className={`text-sm text-center px-4 py-2.5 rounded-lg mb-4 ${
              message.error
                ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                : 'text-green-400 bg-green-500/10 border border-green-500/20'
            }`}>
              {message.text}
            </div>
          )}

          {/* Login Form */}
          {tab === 'login' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-2">帳號</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="輸入帳號..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-2">密碼</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="輸入密碼..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-40"
              >
                {loading ? '登入中...' : '登入'}
              </button>
            </div>
          )}

          {/* Register Form */}
          {tab === 'register' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-2">帳號</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="取一個帳號..."
                  maxLength={10}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-2">密碼</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="設定密碼..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-2">確認密碼</label>
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                  placeholder="再輸入一次..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-40"
              >
                {loading ? '建立中...' : '建立帳號'}
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">或使用以下方式登入</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            {/* LINE */}
            <a
              href="/api/auth/line/login"
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl font-medium transition-all hover:brightness-110"
              style={{ backgroundColor: '#06C755', color: 'white' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              使用 LINE 登入
            </a>

            {/* Google */}
            <button
              onClick={async () => {
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo: `${window.location.origin}/platform/auth/callback`,
                  },
                });
                if (error) showToast('Google 登入失敗：' + error.message);
              }}
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              使用 Google 登入
            </button>

            {/* Facebook */}
            <button
              onClick={() => showToast('Facebook 登入即將推出')}
              className="flex items-center justify-center gap-3 w-full py-3 rounded-xl font-medium text-white transition-all hover:brightness-110"
              style={{ backgroundColor: '#1877F2' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              使用 Facebook 登入
            </button>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <a href="/platform" className="text-white/40 hover:text-white/60 text-sm transition-colors">
            返回首頁
          </a>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </div>
  );
}
