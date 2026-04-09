'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import PlatformNav from '@/components/PlatformNav';
import { useRequireProfile } from '@/lib/use-require-profile';

interface ProfileData {
  name: string;
  email: string;
  createdAt: string;
  avatarUrl: string;
  bindings: { name: string; icon: string; bound: boolean }[];
}

export default function ProfilePage() {
  const router = useRouter();
  useRequireProfile();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const playerName = sessionStorage.getItem('playerName');
      const playerId = sessionStorage.getItem('playerId');

      if (!playerName || !playerId) {
        router.push('/platform/login');
        return;
      }

      // 從 Supabase Auth 取得使用者資訊
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // 判斷帳號綁定狀態
      const identities = user?.identities || [];
      const providerNames = identities.map((i) => i.provider);
      const hasGoogle = providerNames.includes('google');
      const hasEmail = providerNames.includes('email') || !!user?.email;

      // 從 auth 取得 email 和註冊時間
      const email = user?.email || '';
      const createdAt = user?.created_at
        ? new Date(user.created_at).toLocaleDateString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          })
        : '';

      const avatarUrl = user?.user_metadata?.avatar_url || '';

      setProfile({
        name: playerName,
        email,
        createdAt,
        avatarUrl,
        bindings: [
          { name: 'Google', icon: '🔍', bound: hasGoogle },
          { name: 'Email', icon: '✉️', bound: hasEmail },
        ],
      });
      setLoading(false);
    }

    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('playerId');
    sessionStorage.removeItem('playerName');
    router.push('/platform');
  }

  const displayInitial = profile?.name?.charAt(0)?.toUpperCase() || 'P';

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative scroll-smooth"
      style={{ backgroundImage: "url('/bg-platform.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-2 pb-8">

        <PlatformNav />

        {/* 標題 */}
        <h1 className="text-3xl font-bold text-white mb-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">個人檔案</h1>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full" />
          </div>
        ) : profile && (
          <>
            {/* 頭像區塊 */}
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-5 flex items-center gap-5">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="頭像"
                  className="w-24 h-24 rounded-full shadow-lg object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                  {displayInitial}
                </div>
              )}
              <div>
                <div className="text-white text-xl font-bold mb-2">{profile.name}</div>
                <button className="bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  更換頭像
                </button>
              </div>
            </div>

            {/* 基本資料 */}
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-5">
              <h2 className="text-xl font-bold text-white mb-4">基本資料</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <div>
                    <div className="text-white/60 text-xs mb-1">暱稱</div>
                    <div className="text-white">{profile.name}</div>
                  </div>
                  <button className="text-amber-400 hover:text-amber-300 text-sm">編輯</button>
                </div>
                <div className="py-2 border-b border-white/10">
                  <div className="text-white/60 text-xs mb-1">註冊日期</div>
                  <div className="text-white">{profile.createdAt || '—'}</div>
                </div>
                <div className="py-2">
                  <div className="text-white/60 text-xs mb-1">Email</div>
                  <div className="text-white">{profile.email || '—'}</div>
                </div>
              </div>
            </div>

            {/* 帳號綁定 */}
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-5">
              <h2 className="text-xl font-bold text-white mb-4">帳號綁定</h2>
              <div className="space-y-3">
                {profile.bindings.map((b) => (
                  <div key={b.name} className="flex justify-between items-center py-2">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{b.icon}</div>
                      <div className="text-white">{b.name}</div>
                    </div>
                    {b.bound ? (
                      <div className="text-green-400 text-sm font-medium">已綁定 ✓</div>
                    ) : (
                      <button className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                        綁定
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 登出 */}
            <button
              onClick={handleLogout}
              className="w-full bg-red-600/90 hover:bg-red-600 text-white font-medium py-3 rounded-2xl transition-colors border border-red-400/30"
            >
              登出
            </button>
          </>
        )}

      </div>
    </div>
  );
}
