'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupProfilePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 未登入就跳走
  useEffect(() => {
    const id = sessionStorage.getItem('playerId');
    if (!id) {
      router.push('/platform/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError('暱稱須為 2-20 個字元');
      return;
    }

    setSubmitting(true);

    try {
      const playerId = sessionStorage.getItem('playerId');
      const res = await fetch('/api/auth/setup-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, name: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '設定失敗');
        setSubmitting(false);
        return;
      }

      // 更新 sessionStorage
      if (data.token) {
        sessionStorage.setItem('authToken', data.token);
      }
      sessionStorage.setItem('playerName', data.player.name);

      router.push('/platform');
    } catch {
      setError('網路錯誤，請稍後再試');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative flex items-center justify-center"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-8">

          {/* Logo */}
          <div className="text-center mb-6">
            <img
              src="/inkey-logo.png"
              alt="墨鍵物語 Inkey"
              className="h-16 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
            />
            <h1 className="text-2xl font-bold text-white">設定你的暱稱</h1>
            <p className="text-white/50 text-sm mt-2">取一個在平台上使用的名字吧</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="nickname" className="block text-white/70 text-sm mb-2">
                暱稱
              </label>
              <input
                id="nickname"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="2-20 個字元"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-colors"
              />
              <div className="flex justify-between mt-1">
                {error ? (
                  <p className="text-red-400 text-xs">{error}</p>
                ) : (
                  <p className="text-white/30 text-xs">這將是你在平台上的顯示名稱</p>
                )}
                <p className="text-white/30 text-xs">{name.trim().length}/20</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
            >
              {submitting ? '設定中...' : '開始探索'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
