'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('正在完成登入...');

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient();

      // Supabase 會自動從 URL hash 中解析 token
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        setStatus('登入失敗，正在返回...');
        setTimeout(() => router.push('/platform/login'), 2000);
        return;
      }

      const user = session.user;
      const provider = user.app_metadata?.provider || 'google';
      const email = user.email || '';
      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || '';
      const avatarUrl = user.user_metadata?.avatar_url || '';

      // 取得 localStorage 中的邀請碼
      const referralCode = typeof window !== 'undefined' ? localStorage.getItem('referralCode') || '' : '';

      // 根據 provider 呼叫對應的 sync endpoint
      const syncUrl = provider === 'facebook'
        ? '/api/auth/facebook/sync'
        : '/api/auth/google/sync';
      const syncBody = provider === 'facebook'
        ? { facebookId: user.id, email, displayName, avatarUrl, referralCode }
        : { googleId: user.id, email, displayName, avatarUrl, referralCode };

      try {
        // 同步到 players 表
        const res = await fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncBody),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '同步失敗');

        // 儲存登入狀態
        if (data.token) {
          sessionStorage.setItem('authToken', data.token);
        }
        sessionStorage.setItem('playerId', data.player.id);

        // 清除邀請碼
        if (referralCode) localStorage.removeItem('referralCode');

        // 檢查是否有暱稱 — 沒有就導向設定頁
        const playerName = data.player.name;
        if (!playerName) {
          setStatus('請先設定暱稱...');
          setTimeout(() => router.push('/platform/setup-profile'), 500);
        } else {
          sessionStorage.setItem('playerName', playerName);
          setStatus(`歡迎，${playerName}！`);
          setTimeout(() => router.push('/platform'), 800);
        }
      } catch (err) {
        console.error('Google sync error:', err);
        setStatus('帳號同步失敗，正在返回...');
        setTimeout(() => router.push('/platform/login'), 2000);
      }
    }

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative flex items-center justify-center"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div className="relative z-10 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white/70 text-sm">{status}</p>
      </div>
    </div>
  );
}
